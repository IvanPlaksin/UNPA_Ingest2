using Microsoft.AspNetCore.Mvc;
using FlowDeskProxy.Services;

namespace FlowDeskProxy.Controllers;

/// <summary>
/// REST endpoints for chat session management.
/// Chat messages via WebSocket use ChatHub instead.
/// </summary>
[ApiController]
[Route("proxy/chat")]
public class ChatController : ControllerBase
{
    private readonly IGxeApiService _gxe;
    private readonly ILogger<ChatController> _logger;

    public ChatController(IGxeApiService gxe, ILogger<ChatController> logger)
    {
        _gxe = gxe;
        _logger = logger;
    }

    /// <summary>
    /// POST /proxy/chat/session — create a new chat session.
    /// Returns sessionId for use with WebSocket hub.
    /// </summary>
    [HttpPost("session")]
    public async Task<IActionResult> CreateSession([FromBody] CreateSessionRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.UserId))
            return BadRequest(new { error = "userId is required" });

        var session = await _gxe.CreateSessionAsync(body.UserId, body.GraphKey ?? "laptop-provisioning");
        return Ok(new { sessionId = session!.SessionId, phase = session.Phase });
    }

    /// <summary>
    /// POST /proxy/chat/message — send a chat message synchronously (HTTP fallback if WebSocket unavailable).
    /// </summary>
    [HttpPost("message")]
    public async Task<IActionResult> SendMessage([FromBody] ChatMessageRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.SessionId)) return BadRequest(new { error = "sessionId is required" });
        if (string.IsNullOrWhiteSpace(body.UserId)) return BadRequest(new { error = "userId is required" });
        if (string.IsNullOrWhiteSpace(body.Message)) return BadRequest(new { error = "message is required" });

        var request = new ChatRequest(body.SessionId, body.UserId, body.Message);
        var response = await _gxe.SendChatMessageAsync(request);

        if (response == null)
            return StatusCode(502, new { error = "GXE API returned empty response" });

        return Ok(response);
    }

    /// <summary>
    /// GET /proxy/chat/session/{sessionId} — get session state.
    /// </summary>
    [HttpGet("session/{sessionId}")]
    public async Task<IActionResult> GetSession(string sessionId)
    {
        var session = await _gxe.GetSessionAsync(sessionId);
        if (session == null) return NotFound(new { error = "Session not found" });
        return Ok(session);
    }
}

public record CreateSessionRequest(string UserId, string? GraphKey);
public record ChatMessageRequest(string SessionId, string UserId, string Message);
