using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace FlowDeskProxy.Services;

public interface IGxeApiService
{
    Task<ChatResponse?> SendChatMessageAsync(ChatRequest request, CancellationToken ct = default);
    Task<SessionResponse?> CreateSessionAsync(string userId, string graphKey, CancellationToken ct = default);
    Task<JsonDocument?> GetSessionAsync(string sessionId, CancellationToken ct = default);
}

public record ChatRequest(string SessionId, string UserId, string Message, string? GraphKey = null, string? GraphId = null);

public record ChatResponse(
    string SessionId,
    string Response,
    bool IsComplete,
    JsonElement? Choices,
    object? Recommendation,
    string? RequestId,
    string Phase,
    JsonElement? ExecutionLog,
    JsonElement? State);

public record SessionResponse(string SessionId, string Phase);

public class GxeApiService : IGxeApiService
{
    private readonly HttpClient _http;
    private readonly ILogger<GxeApiService> _logger;
    private static readonly JsonSerializerOptions _jsonOpts = new(JsonSerializerDefaults.Web);

    public GxeApiService(HttpClient http, ILogger<GxeApiService> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<ChatResponse?> SendChatMessageAsync(ChatRequest request, CancellationToken ct = default)
    {
        var payload = new
        {
            sessionId = request.SessionId,
            userId = request.UserId,
            message = request.Message,
            graphId = request.GraphId,
            graphKey = request.GraphKey,
        };

        var json = JsonSerializer.Serialize(payload, _jsonOpts);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        _logger.LogDebug("POST /api/v1/flowdesk/chat | session={SessionId} graph={GraphId}", request.SessionId, request.GraphId);

        try
        {
            var response = await _http.PostAsync("/api/v1/flowdesk/chat", content, ct);
            response.EnsureSuccessStatusCode();

            var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var root = doc.RootElement;

            return new ChatResponse(
                SessionId:    GetString(root, "sessionId") ?? request.SessionId,
                Response:     GetString(root, "response") ?? "",
                IsComplete:   GetBool(root, "isComplete"),
                Choices:      GetElement(root, "choices"),
                Recommendation: null,
                RequestId:    GetString(root, "requestId"),
                Phase:        GetString(root, "phase") ?? "dialog",
                ExecutionLog: GetElement(root, "executionLog"),
                State:        GetElement(root, "state")
            );
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "GXE API call failed");
            throw;
        }
    }

    public async Task<SessionResponse?> CreateSessionAsync(string userId, string graphKey, CancellationToken ct = default)
    {
        var sessionId = $"fd-{userId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        _logger.LogDebug("Session created: {SessionId}", sessionId);
        return new SessionResponse(sessionId, "new");
    }

    public async Task<JsonDocument?> GetSessionAsync(string sessionId, CancellationToken ct = default)
    {
        var response = await _http.GetAsync($"/api/v1/flowdesk/laptop/session/{sessionId}", ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        var stream = await response.Content.ReadAsStreamAsync(ct);
        return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
    }

    // ── Helpers ────────────────────────────────────────────────────────
    private static string? GetString(JsonElement root, string key)
        => root.TryGetProperty(key, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    private static bool GetBool(JsonElement root, string key)
        => root.TryGetProperty(key, out var el) && el.ValueKind == JsonValueKind.True;

    // Clone() creates a new JsonDocument that owns its memory,
    // safe to use after the parent JsonDocument is disposed.
    private static JsonElement? GetElement(JsonElement root, string key)
        => root.TryGetProperty(key, out var el) && el.ValueKind != JsonValueKind.Null ? el.Clone() : null;
}
