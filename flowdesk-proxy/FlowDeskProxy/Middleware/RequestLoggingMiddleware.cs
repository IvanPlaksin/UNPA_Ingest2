using System.Diagnostics;

namespace FlowDeskProxy.Middleware;

/// <summary>
/// Logs every inbound request: method, path, status code, and duration.
/// Excludes /hubs/** WebSocket upgrade requests from verbose logging.
/// </summary>
public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();
        var path = context.Request.Path.Value ?? "/";
        var method = context.Request.Method;

        // Skip verbose logging for WebSocket upgrade (SignalR negotiation)
        var isHub = path.StartsWith("/hubs/", StringComparison.OrdinalIgnoreCase);
        if (!isHub)
        {
            _logger.LogInformation("→ {Method} {Path}", method, path);
        }

        try
        {
            await _next(context);
        }
        finally
        {
            sw.Stop();
            var status = context.Response.StatusCode;
            if (!isHub)
            {
                var level = status >= 500 ? LogLevel.Error : status >= 400 ? LogLevel.Warning : LogLevel.Information;
                _logger.Log(level, "← {Method} {Path} → {Status} ({ElapsedMs}ms)", method, path, status, sw.ElapsedMilliseconds);
            }
        }
    }
}
