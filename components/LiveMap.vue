<template>
  <div class="hidden lg:block aspect-[64/48] w-64 relative glass text-white rounded-lg shadow-2xl overflow-hidden">              
    <!-- Map container -->
    <div 
      v-if="!mapError" 
      ref="mapContainer" 
      class="absolute inset-0 w-full h-full rounded-lg"
    ></div>
    
    <!-- Error message when Mapbox token is missing -->
    <div 
      v-if="mapError" 
      class="absolute inset-0 flex items-center justify-center p-4"
    >
      <div class="text-center text-xs text-gray-300">
        <div class="mb-2">🗺️</div>
        <div class="font-medium mb-1">Map Unavailable</div>
        <div class="opacity-75">{{ mapError }}</div>
      </div>
    </div>
  </div>
</template>

<script>
const DEFAULT_LOCATION = {
  coordinates: [-0.1278, 51.5074], // London
  zoom: 8,
};

export default {
  props: {
    aircraftList: {
      type: Array,
      default: () => [],
    },
  },
  data() {
    return {
      map: null,
      aircraftMarkers: new Map(),
      userLocationMarker: null,
      userLocation: null,
      watchId: null,
      mapError: null,
    };
  },
  computed: {
    aircraftWithPositions() {
      return this.aircraftList.filter((aircraft) => {
        return aircraft.decodedPosition && (aircraft.activityLevel === "high" || aircraft.activityLevel === "medium");
      });
    },
  },
  watch: {
    aircraftWithPositions: {
      handler() {
        // Immediately update markers when aircraft positions change
        this.updateAircraftMarkers();
      },
      deep: true,
    },
  },
  methods: {
    async initMap() {
      // Check if Mapbox token is configured
      const token = window.CONFIG?.MAPBOX_ACCESS_TOKEN;
      if (!token || token === "MAPBOX_ACCESS_TOKEN_REQUIRED") {
        this.mapError = "Mapbox token required in CONFIG";
        return;
      }

      try {
        if (!window.mapboxgl) {
          console.log("Loading Mapbox GL JS...");
          await this.loadMapboxScript();
        }

        // Try to get user location first for initial map center
        const initialCenter = await this.getInitialMapCenter();

        this.map = new mapboxgl.Map({
          container: this.$refs.mapContainer,
          style: "mapbox://styles/mapbox/navigation-night-v1",
          center: initialCenter.coordinates,
          zoom: initialCenter.zoom,
          accessToken: token,
        });

        // Handle map errors (invalid token, network issues, etc.)
        this.map.on('error', (e) => {
          console.error('Mapbox error:', e);
          if (e.error && e.error.message) {
            if (e.error.message.includes('401')) {
              this.mapError = "Invalid Mapbox token";
            } else {
              this.mapError = "Map loading failed";
            }
          }
        });

        this.map.on("style.load", () => {
          // Hide labels for cleaner look
          const layers = this.map.getStyle().layers;
          layers.forEach((layer) => {
            if (layer.type === "symbol") {
              this.map.setLayoutProperty(layer.id, "visibility", "none");
            }
          });

          // Style water with darker purple
          const waterLayers = layers.filter((layer) => layer.id.includes("water"));
          waterLayers.forEach((layer) => {
            if (layer.type === "fill") {
              this.map.setPaintProperty(layer.id, "fill-color", "#003366");
            }
          });

          // Style roads with purple accent
          const roadLayers = layers.filter((layer) => layer.id.includes("road"));
          roadLayers.forEach((layer) => {
            if (layer.type === "line") {
              this.map.setPaintProperty(layer.id, "line-color", "#4c3a6e");
            }
          });
        });

        this.updateInterval = setInterval(() => {
          this.updateAircraftMarkers();
        }, 3000);

        // Start watching user location for ongoing updates
        this.requestUserLocation();
        
      } catch (error) {
        console.error('Map initialization failed:', error);
        this.mapError = "Map initialization failed";
      }
    },

    async getInitialMapCenter() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(DEFAULT_LOCATION);
          return;
        }

        const timeout = setTimeout(() => {
          // Fallback after 3 seconds
          resolve(DEFAULT_LOCATION);
        }, 3000);

        navigator.geolocation.getCurrentPosition(
          (position) => {
            clearTimeout(timeout);
            resolve({
              coordinates: [position.coords.longitude, position.coords.latitude],
              zoom: 10,
            });
          },
          (error) => {
            clearTimeout(timeout);
            console.log("Initial geolocation failed:", error.message);
            resolve(DEFAULT_LOCATION);
          },
          {
            enableHighAccuracy: true,
            timeout: 2500,
            maximumAge: 60000,
          }
        );
      });
    },

    async loadMapboxScript() {
      return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.href = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css";
        link.rel = "stylesheet";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    },

    updateAircraftMarkers() {
      if (!this.map) return;

      this.aircraftMarkers.forEach((marker, aircraftId) => {
        const aircraft = this.aircraftWithPositions.find((a) => a.id === aircraftId);
        if (!aircraft) {
          marker.remove();
          this.aircraftMarkers.delete(aircraftId);
        }
      });

      this.aircraftWithPositions.forEach((aircraft) => {
        const { lat, lon } = aircraft.decodedPosition;

        if (this.aircraftMarkers.has(aircraft.id)) {
          const marker = this.aircraftMarkers.get(aircraft.id);
          marker.setLngLat([lon, lat]);

          // Update marker color if it has changed
          const markerEl = marker.getElement();
          const currentColor = aircraft.color || "#ef4444";
          if (markerEl.style.backgroundColor !== currentColor) {
            markerEl.style.backgroundColor = currentColor;
          }
        } else {
          const el = document.createElement("div");
          el.className = "aircraft-marker";
          const markerColor = aircraft.color || "#ef4444";
          el.style.cssText = `
            width: 12px;
            height: 12px;
            background-color: ${markerColor};
            border: 2px solid white;
            border-radius: 50%;
            cursor: pointer;
          `;

          const marker = new mapboxgl.Marker(el).setLngLat([lon, lat]).addTo(this.map);

          if (aircraft.callsign || aircraft.altitude) {
            const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
              <div class="text-xs text-white">
                ${aircraft.callsign ? `<strong>${aircraft.callsign}</strong><br>` : ""}
                ${
                  aircraft.altitude
                    ? `Alt: ${aircraft.altitude.toLocaleString()}${aircraft.unit === 0 ? "ft" : "m"}<br>`
                    : ""
                }
                ICAO: ${aircraft.icao?.toString(16).toUpperCase() || "Unknown"}
              </div>
            `);
            marker.setPopup(popup);
          }

          this.aircraftMarkers.set(aircraft.id, marker);
        }
      });

      this.fitMapToAircraft();
    },

    fitMapToAircraft() {
      if (!this.map) return;

      const bounds = new mapboxgl.LngLatBounds();
      let hasPoints = false;

      // Add user location to bounds if available
      if (this.userLocation) {
        bounds.extend([this.userLocation.lon, this.userLocation.lat]);
        hasPoints = true;
      }

      // Add aircraft positions to bounds
      this.aircraftWithPositions.forEach((aircraft) => {
        const { lat, lon } = aircraft.decodedPosition;
        bounds.extend([lon, lat]);
        hasPoints = true;
      });

      if (!hasPoints) return;

      // If we only have one point (either just user location or just one aircraft)
      if (
        (this.userLocation && this.aircraftWithPositions.length === 0) ||
        (!this.userLocation && this.aircraftWithPositions.length === 1)
      ) {
        const singlePoint = this.userLocation
          ? [this.userLocation.lon, this.userLocation.lat]
          : [this.aircraftWithPositions[0].decodedPosition.lon, this.aircraftWithPositions[0].decodedPosition.lat];

        this.map.flyTo({
          center: singlePoint,
          zoom: 10,
          duration: 1000,
        });
      } else {
        // Multiple points - fit bounds to include all (user + aircraft)
        this.map.fitBounds(bounds, {
          padding: 40,
          duration: 1000,
          maxZoom: 12,
        });
      }
    },

    // Calculate distance between two points in kilometers using Haversine formula
    calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371; // Earth's radius in km
      const dLat = this.toRadians(lat2 - lat1);
      const dLon = this.toRadians(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },

    toRadians(degrees) {
      return degrees * (Math.PI / 180);
    },

    requestUserLocation() {
      if (!navigator.geolocation) {
        console.log("Geolocation is not supported by this browser");
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      };

      // Watch position for continuous updates
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.userLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          this.updateUserLocationMarker();
        },
        (error) => {
          console.log("Geolocation error:", error.message);
          // Don't show alerts for permission denied - user chose not to share
        },
        options
      );
    },

    updateUserLocationMarker() {
      if (!this.map || !this.userLocation) return;

      const { lat, lon } = this.userLocation;

      if (this.userLocationMarker) {
        // Update existing marker
        this.userLocationMarker.setLngLat([lon, lat]);
      } else {
        // Create new user location marker
        const el = document.createElement("div");
        el.className = "user-location-marker";
        el.innerHTML = `
          <div style="
            width: 16px;
            height: 16px;
            background: linear-gradient(135deg, #a855f7, #ec4899);
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.4);
            position: relative;
          ">
          </div>
        `;

        this.userLocationMarker = new mapboxgl.Marker(el).setLngLat([lon, lat]).addTo(this.map);

        // Add popup for user location
        const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
          <div class="text-xs text-white">
            <strong>Your Location</strong><br>
            Accuracy: ~${Math.round(this.userLocation.accuracy)}m
          </div>
        `);
        this.userLocationMarker.setPopup(popup);
      }
    },
  },
  mounted() {
    this.initMap();
  },
  beforeUnmount() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    if (this.map) {
      this.map.remove();
    }
  },
};
</script>