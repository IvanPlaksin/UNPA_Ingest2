using Microsoft.AspNetCore.SignalR;
using FlowDeskProxy.Services;

namespace FlowDeskProxy.Hubs;

/// <summary>
/// SignalR Hub providing WebSocket-based chat for the FlowDesk SPA.
///
/// Client JS: const conn = new HubConnectionBuilder().withUrl("/hubs/chat").build();
///            conn.on("ReceiveMessage", (msg) => ...);
///            await conn.invoke("SendMessage", sessionId, userId, message);
/// </summary>
public class ChatHub : Hub
{
    private readonly IGxeApiService _gxe;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(IGxeApiService gxe, ILogger<ChatHub> logger)
    {
        _gxe = gxe;
        _logger = logger;
    }

    /// <summary>
    /// Client invokes this to send a chat message.
    /// Response is pushed back via "ReceiveMessage" event.
    /// </summary>
    public async Task SendMessage(string sessionId, string userId, string message, string? graphId = null)
    {
        _logger.LogDebug("SendMessage: session={SessionId} user={UserId} graph={GraphId}", sessionId, userId, graphId);

        try
        {
            var request = new ChatRequest(sessionId, userId, message, GraphId: graphId);
            var response = await _gxe.SendChatMessageAsync(request);

            if (response == null)
            {
                await Clients.Caller.SendAsync("Error", "GXE API returned empty response");
                return;
            }

            await Clients.Caller.SendAsync("ReceiveMessage", new
            {
                sessionId = response.SessionId,
                response = response.Response,
                choices = response.Choices,
                recommendation = response.Recommendation,
                requestId = response.RequestId,
                isComplete = response.IsComplete,
                phase = response.Phase,
                executionLog = response.ExecutionLog,
                state = response.State,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SendMessage failed for session {SessionId}", sessionId);
            await Clients.Caller.SendAsync("Error", $"Request failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Subscribe to all updates for a session (group-based broadcast).
    /// </summary>
    public async Task SubscribeToSession(string sessionId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"session:{sessionId}");
        _logger.LogDebug("Connection {ConnectionId} subscribed to session {SessionId}", Context.ConnectionId, sessionId);
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
