<template>
  <div class="relative glass flex flex-col text-white rounded-lg shadow-2xl grow overflow-hidden">
    <div class="px-5 py-3 border-b border-white/10 border-opacity-10 z-10">
      <div class="flex items-center gap-4">
        <div class="relative">
          <div class="w-4 h-4 bg-gradient-to-br from-pink-400 to-purple-600 rounded-full shadow-lg"></div>
          <div
            class="absolute inset-0 w-4 h-4 bg-gradient-to-br from-pink-400 to-purple-600 rounded-full animate-ping"
          ></div>
          <div class="absolute inset-0 size-4 rounded-full animate-breathe">
            <div class="w-full h-full bg-gradient-to-br from-pink-400 to-purple-600 rounded-full"></div>
          </div>
        </div>
        <div class="flex flex-col">
          <span class="font-bold text-sm tracking-wide uppercase">Live Signal</span>
          <span class="text-xs opacity-70">1090 MHz ADS-B</span>
        </div>
      </div>
    </div>

    <div ref="messageContainer" class="h-[100px] grow overflow-hidden px-5 py-3">
      <div
        v-if="!msgReceived || messageHistory.length === 0"
        class="text-center text-gray-400 text-sm py-8 h-full flex items-center justify-center"
      >
        Waiting for incoming signals...
      </div>
      <div
        v-for="(entry, index) in messageHistory.slice(-20)"
        :key="index"
        class="text-[10px] font-mono flex items-start gap-3 opacity-80 hover:opacity-100 transition-opacity mb-1"
      >
        <span class="text-purple-300 flex-shrink-0 w-14">{{ formatTime(entry.timestamp) }}</span>
        <span class="break-all text-gray-200">{{ formatMessage(entry.message) }}</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    msgReceived: {
      type: Boolean,
      default: false,
    },
    messageHistory: {
      type: Array,
      default: () => [],
    },
  },
  updated() {
    this.$nextTick(() => {
      const container = this.$refs.messageContainer;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  },
  methods: {
    formatMessage(msg) {
      let summary = [];

      if (msg.identity) summary.push(`ID: ${msg.identity}`);
      if (msg.icao) summary.push(`ICAO: ${msg.icao.toString(16).toUpperCase()}`);
      if (msg.callsign) summary.push(`Call: ${msg.callsign}`);
      if (msg.altitude) summary.push(`Alt: ${msg.altitude.toLocaleString()}${msg.unit === 0 ? "ft" : "m"}`);
      if (msg.speed) summary.push(`Speed: ${Math.round(msg.speed)}`);
      if (msg.heading) summary.push(`Hdg: ${Math.round(msg.heading)}°`);
      if (msg.rawLatitude) summary.push(`Lat: ${msg.rawLatitude}`);
      if (msg.rawLongitude) summary.push(`Lon: ${msg.rawLongitude}`);
      if (msg.msgtype) summary.push(`Type: DF${msg.msgtype}`);

      return summary.length > 0 ? summary.join(" | ") : "Raw message received";
    },
    formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    },
  },
};
</script>
