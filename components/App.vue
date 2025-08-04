<template>
  <!-- Intro Section -->
  <section v-if="!appStarted" class="flex items-center justify-center min-h-screen text-white">
    <div class="text-center">
      <h1 class="text-6xl font-bold">SDR Aircraft Monitor</h1>
      <p class="mb-20">
        Based on
        <a
          href="https://charliegerard.dev"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sky-200 hover:text-white"
          >Charlie Gerard</a
        >'s amazing
        <a
          href="https://charliegerard.dev/blog/aircraft-radar-system-rtl-sdr-web-usb/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sky-200 hover:text-white"
          >JavaScript Aircraft Radar System</a
        >
      </p>
      <button
        @click="connectToAntenna"
        class="bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white px-10 py-4 rounded-full text-xl font-semibold cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
      >
        Connect
      </button>

      <p class="text-xs mt-2 opacity-50">Requires an RTL-SDR USB dongle<br />+ WebUSB capable browser</p>
    </div>
  </section>

  <!-- Main Application -->
  <main v-if="appStarted" class="container mx-auto p-6">
    <div class="flex flex-col text-center mb-8">
      <h1 class="text-5xl font-bold text-white mb-4">SDR Aircraft Monitor</h1>
      <p class="text-sm text-gray-300">
        Based on
        <a
          href="https://charliegerard.dev"
          target="_blank"
          rel="noopener noreferrer"
          class="text-purple-300 hover:text-purple-100"
          >Charlie Gerard</a
        >'s amazing
        <a
          href="https://charliegerard.dev/blog/aircraft-radar-system-rtl-sdr-web-usb/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-purple-300 hover:text-purple-100"
          >JavaScript Aircraft Radar System</a
        >
      </p>
    </div>

    <header class="flex flex-col lg:flex-row gap-6 mb-6">
      <!-- Live Bar Component -->
      <live-bar :msg-received="msgReceived" :message-history="messageHistory"></live-bar>

      <!-- Live Map Component -->
      <live-map :aircraft-list="aircraftList"></live-map>

      <!-- Status Box Component -->
      <status-box
        :aircraft-list="aircraftList"
        :total-messages="totalMessages"
        :msg-received="msgReceived"
        :message-history="messageHistory"
      >
      </status-box>
    </header>

    <!-- Aircraft Table Component -->
    <aircraft-table :aircraft-list="aircraftList" :live-message="liveMessage"></aircraft-table>

    <!-- Footer Component -->
    <app-footer></app-footer>
  </main>
</template>

<script>
// Configure vue3-sfc-loader options
const options = {
  moduleCache: {
    vue: Vue,
  },
  async getFile(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw Object.assign(new Error(res.statusText + " " + url), { res });
    }
    return {
      getContentData: (asBinary) => (asBinary ? res.arrayBuffer() : res.text()),
    };
  },
  addStyle(textContent) {
    const style = document.createElement("style");
    style.textContent = textContent;
    const ref = document.head.getElementsByTagName("style")[0] || null;
    document.head.insertBefore(style, ref);
  },
};

export default {
  components: {
    "live-bar": Vue.defineAsyncComponent(() =>
      window["vue3-sfc-loader"].loadModule("./components/LiveBar.vue", options)
    ),
    "live-map": Vue.defineAsyncComponent(() =>
      window["vue3-sfc-loader"].loadModule("./components/LiveMap.vue", options)
    ),
    "status-box": Vue.defineAsyncComponent(() =>
      window["vue3-sfc-loader"].loadModule("./components/StatusBox.vue", options)
    ),
    "aircraft-table": Vue.defineAsyncComponent(() =>
      window["vue3-sfc-loader"].loadModule("./components/AircraftTable.vue", options)
    ),
    "app-footer": Vue.defineAsyncComponent(() =>
      window["vue3-sfc-loader"].loadModule("./components/Footer.vue", options)
    ),
  },
  data() {
    return {
      aircraftList: [],
      currentMessage: null,
      messageHistory: [],
      appStarted: false,
      msgReceived: false,
      demodulator: null,
      readSamples: true,
      intervalId: null,
      aircraftColors: new Map(),
      availableColors: [
        "#ef4444", // red
        "#10b981", // emerald
        "#f59e0b", // amber
        "#8b5cf6", // violet
        "#06b6d4", // cyan
        "#84cc16", // lime
        "#f97316", // orange
        "#ec4899", // pink
        "#6366f1", // indigo
        "#14b8a6", // teal
        "#a855f7", // purple
      ],
      colorIndex: 0,
    };
  },
  computed: {
    totalMessages() {
      return this.aircraftList.reduce((sum, aircraft) => sum + aircraft.messageCount, 0);
    },

    liveMessage() {
      if (!this.msgReceived || !this.currentMessage) {
        return "Waiting for incoming signals...";
      }

      const msg = this.currentMessage;
      let summary = [];

      if (msg.identity) summary.push(`ID: ${msg.identity}`);
      if (msg.icao) summary.push(`ICAO: ${msg.icao.toString(16).toUpperCase()}`);
      if (msg.callsign) summary.push(`Call: ${msg.callsign}`);
      if (msg.altitude) summary.push(`Alt: ${msg.altitude.toLocaleString()}${msg.unit === 0 ? "ft" : "m"}`);
      if (msg.speed) summary.push(`Speed: ${Math.round(msg.speed)}`);
      if (msg.heading) summary.push(`Hdg: ${Math.round(msg.heading)}°`);
      if (msg.msgtype) summary.push(`Type: DF${msg.msgtype}`);

      return summary.length > 0 ? summary.join(" | ") : "Raw message received";
    },
  },

  watch: {
    aircraftList: {
      handler() {
        this.updateDocumentTitle();
      },
      deep: true,
    },
  },

  methods: {
    updateDocumentTitle() {
      const count = this.aircraftList.length;
      const baseTitle = "SDR Aircraft Monitor";

      if (count === 0) {
        document.title = baseTitle;
      } else {
        document.title = `(${count}) ${baseTitle}`;
      }
    },

    async connectToAntenna() {
      try {
        this.demodulator = new window.Demodulator();

        const sdr = await RtlSdr.requestDevice();
        this.appStarted = true;

        await sdr.open({
          ppm: 0.5,
        });

        const actualSampleRate = await sdr.setSampleRate(2000000);
        const actualCenterFrequency = await sdr.setCenterFrequency(1090000000);

        await sdr.resetBuffer();

        console.log("Starting signal processing...");
        console.log("Actual sample rate:", actualSampleRate);
        console.log("Actual center frequency:", actualCenterFrequency);

        while (this.readSamples) {
          const samples = await sdr.readSamples(128000);
          const data = new Uint8Array(samples);
          this.demodulator.process(data, 256000, this.onMessage);
        }
      } catch (error) {
        console.error("Failed to connect to antenna:", error);
        alert("Failed to connect to antenna. Please make sure your RTL-SDR device is connected.");
      }
    },

    onMessage(msg) {
      if (!this.msgReceived) {
        this.msgReceived = true;
      }

      this.currentMessage = msg;

      // Add to message history (keep last 50 messages)
      this.messageHistory.push({
        message: msg,
        timestamp: Date.now(),
      });

      if (this.messageHistory.length > 50) {
        this.messageHistory.shift();
      }

      this.updateAircraftState(msg);
    },

    updateAircraftState(msg) {
      const uniqueId = msg.icao || `aircraft-${Date.now()}`;
      const fields = [
        "identity",
        "icao",
        "callsign",
        "altitude",
        "speed",
        "heading",
        "rawLatitude",
        "rawLongitude",
        "aircraftType",
        "unit",
      ];

      // Find existing aircraft
      const existingIndex = this.aircraftList.findIndex((a) => a.id === uniqueId);

      if (existingIndex === -1) {
        // Create new aircraft
        const newAircraft = {
          id: uniqueId,
          messageCount: 1,
          firstSeen: Date.now(),
          lastRecieved: Date.now(),
          // CPR position decoding
          cprFrames: { even: null, odd: null },
          decodedPosition: null,
        };

        // Set fields from message, defaulting to null
        fields.forEach((field) => {
          newAircraft[field] = msg[field] || null;
        });

        // Handle position messages for CPR decoding
        this.processCPRPosition(newAircraft, msg);

        // Update activity state and assign color if needed
        this.updateActivityState(newAircraft);

        this.aircraftList.push(newAircraft);
      } else {
        // Update existing aircraft
        const aircraft = this.aircraftList[existingIndex];

        fields.forEach((field) => {
          if (msg[field] != null) aircraft[field] = msg[field];
        });

        // Handle position messages for CPR decoding
        this.processCPRPosition(aircraft, msg);

        aircraft.messageCount++;
        aircraft.lastRecieved = Date.now();

        // Update activity state
        this.updateActivityState(aircraft);
      }
    },

    updateActivityState(aircraft) {
      const now = Date.now();
      const timeSinceLastMessage = (now - aircraft.lastRecieved) / 1000;
      const messageCount = aircraft.messageCount;
      const previousActivityLevel = aircraft.activityLevel;

      if (timeSinceLastMessage < 10 && messageCount > 20) {
        aircraft.activityLevel = "high";
      } else if (timeSinceLastMessage < 30 && messageCount > 5) {
        aircraft.activityLevel = "medium";
      } else if (timeSinceLastMessage < 60) {
        aircraft.activityLevel = "low";
      } else {
        aircraft.activityLevel = "stale";
      }

      // Assign color when aircraft becomes medium or high activity
      if (
        (aircraft.activityLevel === "medium" || aircraft.activityLevel === "high") &&
        previousActivityLevel !== "medium" &&
        previousActivityLevel !== "high"
      ) {
        this.assignAircraftColor(aircraft);
      }

      // Remove color when aircraft is no longer medium or high activity
      if (
        (previousActivityLevel === "medium" || previousActivityLevel === "high") &&
        aircraft.activityLevel !== "medium" &&
        aircraft.activityLevel !== "high"
      ) {
        this.removeAircraftColor(aircraft);
      }
    },

    assignAircraftColor(aircraft) {
      if (!this.aircraftColors.has(aircraft.id)) {
        const color = this.availableColors[this.colorIndex % this.availableColors.length];
        this.aircraftColors.set(aircraft.id, color);
        aircraft.color = color;
        this.colorIndex++;
      }
    },

    removeAircraftColor(aircraft) {
      if (this.aircraftColors.has(aircraft.id)) {
        this.aircraftColors.delete(aircraft.id);
        aircraft.color = null;
      }
    },

    processCPRPosition(aircraft, msg) {
      // Process the CPR position message
      if (window.processCPRPosition(aircraft, msg)) {
        // Try to decode position if we have frame data
        const decodedPosition = window.decodeCPRPosition(aircraft);
        if (decodedPosition) {
          aircraft.decodedPosition = decodedPosition;
        }
      }
    },
  },

  mounted() {
    // Set initial document title
    this.updateDocumentTitle();

    // Focus on the Connect button on initial page load
    if (!this.appStarted) {
      this.$nextTick(() => {
        const connectButton = document.querySelector("button");
        if (connectButton) {
          connectButton.focus();
        }
      });
    }

    // Expose state to global for debugging
    window.vueAppState = {
      aircraftList: this.aircraftList,
      currentMessage: this.currentMessage,
      appStarted: this.appStarted,
      msgReceived: this.msgReceived,
    };

    // Update activity states every 5 seconds
    this.activityUpdateInterval = setInterval(() => {
      this.aircraftList.forEach((aircraft) => {
        this.updateActivityState(aircraft);
      });
    }, 5000);
  },

  beforeUnmount() {
    if (this.activityUpdateInterval) {
      clearInterval(this.activityUpdateInterval);
    }
  },
};
</script>

<style scoped>
/* Natural breathing animation for live signal */
@keyframes breathe {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.15);
  }
}

.animate-breathe {
  animation: breathe 2s ease-in-out infinite;
}

/* Aircraft marker hover effect */
.aircraft-marker {
  transition: transform 0.2s ease;
}

.aircraft-marker:hover {
  transform: scale(1.2);
}
</style>
