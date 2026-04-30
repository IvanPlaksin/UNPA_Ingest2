using FlowDeskProxy.Hubs;
using FlowDeskProxy.Middleware;
using FlowDeskProxy.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// SignalR for WebSocket-based chat
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 64 * 1024; // 64KB
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
});

// HttpClient for forwarding requests to GXE API
builder.Services.AddHttpClient<IGxeApiService, GxeApiService>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["GxeApi:BaseUrl"] ?? "http://localhost:3001");
    client.Timeout = TimeSpan.FromMilliseconds(
        builder.Configuration.GetValue<int>("GxeApi:TimeoutMs", 30000));
    client.DefaultRequestHeaders.Add("X-Proxy-Source", "FlowDeskProxy");
});

// CORS — allow FlowDesk SPA origin
builder.Services.AddCors(options =>
{
    options.AddPolicy("FlowDeskSpa", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:5173", "http://localhost:3000"];
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // required for SignalR
    });
});

// ── YARP Reverse Proxy ────────────────────────────────────────────────────
// Forwards /api/** directly to GXE API (bypasses SignalR hub)
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

// ── App pipeline ──────────────────────────────────────────────────────────
var app = builder.Build();

app.UseCors("FlowDeskSpa");

// Request/response logging middleware
app.UseMiddleware<RequestLoggingMiddleware>();

app.UseRouting();
app.UseAuthorization();

// Map SignalR hubs (WebSocket endpoints)
app.MapHub<ChatHub>("/hubs/chat");

// Map REST controllers
app.MapControllers();

// Map YARP reverse proxy (all /api/** except /api/flowdesk/laptop/** which go through SignalR)
app.MapReverseProxy();

// Serve React SPA static files in production
if (app.Environment.IsProduction())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
    app.MapFallbackToFile("index.html");
}

app.Run();
