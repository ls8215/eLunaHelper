const googleService = {
  request() {
    throw new Error("Google Translate service is not implemented.");
  },
};

if (typeof self !== "undefined") {
  self.googleService = googleService;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = googleService;
}

