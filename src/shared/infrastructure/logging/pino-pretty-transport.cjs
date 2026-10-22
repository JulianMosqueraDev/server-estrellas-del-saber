const pretty = require("pino-pretty");

module.exports = (options) =>
  pretty({
    ...options,
    messageFormat(log, messageKey, _levelLabel, { colors }) {
      if (log.event !== "http.request") return log[messageKey];

      const statusCode = Number(log.statusCode);
      const statusLabel =
        statusCode >= 500
          ? colors.red("FAIL")
          : statusCode >= 400
            ? colors.yellow("WARN")
            : colors.green("OK");

      return `${statusLabel} ${colors.bold(String(statusCode))} ${colors.blue(log.method)} ${log.route} ${colors.cyan(log.ip)} ${log.durationMs} ms`;
    },
  });
