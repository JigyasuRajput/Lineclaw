class RetentionService {
  constructor(options = {}) {
    this.repository = options.repository;
    this.conversationMemory = options.conversationMemory || null;
  }

  cleanup(nowTimestamp) {
    const repositoryResult = this.repository.cleanupExpired(nowTimestamp);
    const memoryResult = this.conversationMemory
      ? this.conversationMemory.cleanup(nowTimestamp)
      : { removedLogs: 0, mode: "none" };

    return {
      removedLogs: repositoryResult.removedLogs + memoryResult.removedLogs,
      removedDedupe: repositoryResult.removedDedupe,
      memoryMode: memoryResult.mode,
    };
  }
}

module.exports = {
  RetentionService,
};
