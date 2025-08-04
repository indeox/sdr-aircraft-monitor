<template>
  <div class="glass rounded-lg shadow-2xl overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="border-b border-white/10">
          <tr>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">ICAO</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Callsign</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Altitude</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Speed</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Heading</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Position</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Msgs</th>
            <th class="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Received</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/10">
          <tr
            v-for="aircraft in sortedAircraft"
            :key="aircraft.id"
            :class="getActivityClass(aircraft)"
            class="hover:bg-white hover:bg-opacity-5 transition-all duration-200"
          >
            <td class="px-4 py-3 text-sm text-gray-200">{{ formatIcao(aircraft.icao) }}</td>
            <td class="px-4 py-3 text-sm text-gray-200">
              <a 
                v-if="aircraft.callsign" 
                :href="getFlightRadarPageForCallSign(aircraft.callsign)" 
                target="_blank" 
                rel="noopener noreferrer"
                class="!text-purple-300 !no-underline hover:text-purple-100 transition-colors"
              >
                {{ aircraft.callsign }}
              </a>
              <span v-else>-</span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-200">{{ formatAltitude(aircraft) }}</td>
            <td class="px-4 py-3 text-sm text-gray-200">{{ formatSpeed(aircraft.speed) }}</td>
            <td class="px-4 py-3 text-sm text-gray-200">{{ formatHeading(aircraft.heading) }}</td>
            <td class="px-4 py-3 text-sm text-gray-200">
              <div class="flex items-center gap-2">
                <a 
                  v-if="aircraft.decodedPosition" 
                  :href="getGoogleMapsLink(aircraft)" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  class="!text-purple-300 !no-underline hover:text-purple-100 transition-colors"
                >
                  {{ formatCoordinates(aircraft) }}
                </a>
                <span v-else>{{ formatCoordinates(aircraft) }}</span>
                <div 
                  v-if="aircraft.color && aircraft.decodedPosition"
                  class="w-3 h-3 rounded-full border border-white border-opacity-50"
                  :style="{ backgroundColor: aircraft.color }"
                ></div>                  
              </div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-200">{{ formatAircraftType(aircraft.aircraftType) }}</td>
            <td class="px-4 py-3 text-sm text-gray-200">{{ aircraft.messageCount }}</td>
            <td class="px-4 py-3 text-sm text-gray-200">{{ formatRelativeTime(aircraft.lastRecieved) }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="aircraftList.length === 0" class="text-center py-16">
        <div class="text-gray-400 text-lg">{{ liveMessage }}</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    aircraftList: {
      type: Array,
      default: () => [],
    },
    liveMessage: {
      type: String,
      default: "Waiting for incoming signals...",
    },
  },
  computed: {
    sortedAircraft() {
      return [...this.aircraftList].sort((a, b) => {
        // Define activity level priority (higher number = higher priority)
        const activityPriority = {
          high: 3,
          medium: 2,
          low: 1,
          stale: 0,
        };

        const aPriority = activityPriority[a.activityLevel] || 0;
        const bPriority = activityPriority[b.activityLevel] || 0;

        // First sort by activity level (high/medium at top)
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }

        // Then sort by message count within same activity level
        return b.messageCount - a.messageCount;
      });
    },
  },
  methods: {
    formatIcao(icao) {
      return icao ? icao.toString(16).toUpperCase() : "-";
    },

    formatAltitude(aircraft) {
      if (!aircraft.altitude) return "-";
      return `${aircraft.altitude.toLocaleString()}ft`;
    },

    formatSpeed(speed) {
      return speed ? Math.round(speed).toString() : "-";
    },

    formatHeading(heading) {
      return heading ? `${Math.round(heading)}°` : "-";
    },

    formatCoordinates(aircraft) {
      if (aircraft.decodedPosition) {
        const { lat, lon } = aircraft.decodedPosition;
        return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      }

      return "-";
    },

    formatRelativeTime(timestamp) {
      if (!timestamp) return "-";

      const now = Date.now();
      const diff = Math.floor((now - timestamp) / 1000);

      if (diff < 1) return "now";
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    },

    getActivityClass(aircraft) {
      return `activity-${aircraft.activityLevel || "stale"}`;
    },

    hasValidCoordinates(rawLat, rawLng) {
      if (!rawLat || !rawLng) return false;

      const latRaw = parseInt(rawLat);
      const lngRaw = parseInt(rawLng);

      if (isNaN(latRaw) || isNaN(lngRaw)) return false;

      return latRaw >= 0 && latRaw <= 131071 && lngRaw >= 0 && lngRaw <= 131071;
    },

    decodeCoordinates(latRaw, lngRaw) {
      return null;
    },

    getGoogleMapsLink(aircraft) {
      if (aircraft.decodedPosition) {
        const { lat, lon } = aircraft.decodedPosition;
        return `https://www.google.com/maps?q=${lat},${lon}&z=12`;
      }
      return "#";
    },

    getFlightRadarPageForCallSign(callsign) {
      if (!callsign) return null;
      return `https://www.flightradar24.com/${callsign}/`;
    },

    formatAircraftType(aircraftType) {
      if (aircraftType === null || aircraftType === undefined) return "-";

      const types = {
        0: "Light",
        1: "Small",
        2: "Large",
        3: "Heavy",
      };

      return types[aircraftType] || `Type ${aircraftType}`;
    },
  },
};
</script>