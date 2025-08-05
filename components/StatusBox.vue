<template>
  <div class="glass text-white px-6 py-5 rounded-lg shadow-2xl min-w-64">
    <div class="flex flex-col gap-1">
      <div class="flex justify-between items-center">
        <span class="text-xs opacity-70 uppercase tracking-wider">Aircraft Tracked</span>
        <span
          class="font-mono font-bold text-sm bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
        >
          {{ aircraftList.length }}
        </span>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs opacity-70 uppercase tracking-wider">Active (1min)</span>
        <span class="font-mono font-bold text-sm text-green-400">{{ activeAircraft.length }}</span>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs opacity-70 uppercase tracking-wider">Avg/Aircraft</span>
        <span class="font-mono font-bold text-sm text-gray-200">{{ averageMessagesPerAircraft }}</span>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs opacity-70 uppercase tracking-wider">Total Messages</span>
        <span class="font-mono font-bold text-sm text-gray-200">{{ totalMessages.toLocaleString() }}</span>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs opacity-70 uppercase tracking-wider">Messages/sec</span>
        <span class="font-mono font-bold text-sm text-gray-200">{{ messagesPerSecond }}</span>
      </div>

      <div class="border-t border-white/10 pt-3 mt-2">
        <div class="flex justify-between items-center">
          <span class="text-xs opacity-70 uppercase tracking-wider">Session Time</span>
          <span class="font-mono font-bold text-sm text-purple-300">{{ uptime }}</span>
        </div>
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
    totalMessages: {
      type: Number,
      default: 0,
    },
    msgReceived: {
      type: Boolean,
      default: false,
    },
    messageHistory: {
      type: Array,
      default: () => [],
    },
  },
  data() {
    return {
      currentTime: Date.now(),
      uptimeInSeconds: 0,
      timerInterval: null,
    };
  },
  computed: {
    activeAircraft() {
      const now = Date.now();
      return this.aircraftList.filter((aircraft) => now - aircraft.lastRecieved < 60000);
    },
    averageMessagesPerAircraft() {
      if (this.aircraftList.length === 0) return 0;
      return Math.round(this.totalMessages / this.aircraftList.length);
    },
    messagesPerSecond() {
      const now = Date.now();
      const oneSecondAgo = now - 1000;
      return this.messageHistory.filter((entry) => entry.timestamp > oneSecondAgo).length;
    },
    uptime() {
      const elapsed = Math.floor(this.uptimeInSeconds);

      const hours = Math.floor(elapsed / 3600)
        .toString()
        .padStart(2, "0");
      const minutes = Math.floor((elapsed % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (elapsed % 60).toString().padStart(2, "0");

      return `${hours}:${minutes}:${seconds}`;
    },
  },
  mounted() {
    this.timerInterval = setInterval(() => {
      this.uptimeInSeconds += 1;
      this.currentTime = Date.now(); // Update current time to trigger computed recalculation
    }, 1000);
  },
  beforeUnmount() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  },
};
</script>
