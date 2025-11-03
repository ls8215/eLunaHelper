const deeplService = {
  request() {
    throw new Error("DeepL service is not implemented.");
  },
};

if (typeof self !== "undefined") {
  self.deeplService = deeplService;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = deeplService;
}
