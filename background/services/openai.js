const openaiService = {
  request() {
    throw new Error("OpenAI service is not implemented.");
  },
};

if (typeof self !== "undefined") {
  self.openaiService = openaiService;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = openaiService;
}
