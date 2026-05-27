package net.adlmstudio.mpxj;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import net.sf.mpxj.ProjectFile;
import net.sf.mpxj.mpp.MPPReader;
import net.sf.mpxj.mspdi.MSPDIWriter;
import net.sf.mpxj.reader.UniversalProjectReader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.util.concurrent.Executors;

/**
 * Minimal MPXJ HTTP converter service.
 *
 * Endpoints:
 *   POST /convert  — request body is the raw .mpp bytes, response body is
 *                    MS Project XML (MSPDI). Optional X-API-Key header.
 *   GET  /health   — returns "ok" if the server is up.
 *
 * Environment:
 *   PORT          (default 8080) — port to bind. Render sets this for you.
 *   MPXJ_API_KEY  (optional)     — if set, requests must include matching
 *                                  X-API-Key header. Otherwise open.
 *
 * The server is single-binary, no Spring, no frameworks. The JDK's built-in
 * HttpServer + a small thread pool is enough for our throughput (a few
 * uploads per minute, each a few seconds of CPU work).
 */
public class Main {
  public static void main(String[] args) throws IOException {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    String apiKey = System.getenv("MPXJ_API_KEY"); // may be null

    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
    server.setExecutor(Executors.newFixedThreadPool(4));

    server.createContext("/health", exchange -> sendText(exchange, 200, "ok"));
    server.createContext("/", new ConvertHandler(apiKey));

    System.out.println("MPXJ converter listening on :" + port +
        (apiKey == null || apiKey.isEmpty() ? " (open access)" : " (API key required)"));
    server.start();
  }

  static class ConvertHandler implements HttpHandler {
    private final String apiKey;

    ConvertHandler(String apiKey) {
      this.apiKey = apiKey;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
      try {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();

        // Accept POST to either /convert (canonical) or / (root). Forgiving
        // here saves operators from a confusing 404 when they paste the
        // bare service hostname into MPXJ_API_URL on the Node side. Any
        // other (non-empty, non-root, non-/convert) path still 404s so
        // we don't silently swallow typos like /converrt.
        boolean isConvertPath =
            path.endsWith("/convert") || path.equals("/") || path.isEmpty();
        if (!"POST".equalsIgnoreCase(method) || !isConvertPath) {
          sendText(exchange, 404, "POST /convert (or /) with .mpp body, or GET /health");
          return;
        }

        // Auth — only when MPXJ_API_KEY is set on the server.
        if (apiKey != null && !apiKey.isEmpty()) {
          String supplied = exchange.getRequestHeaders().getFirst("X-API-Key");
          if (supplied == null || !apiKey.equals(supplied)) {
            sendText(exchange, 401, "missing or invalid X-API-Key");
            return;
          }
        }

        // Read body (capped — MPP files >50MB are unusual; reject them so
        // we don't OOM on malicious uploads).
        long contentLength = -1;
        try {
          String cl = exchange.getRequestHeaders().getFirst("Content-Length");
          if (cl != null) contentLength = Long.parseLong(cl);
        } catch (NumberFormatException ignored) {
          // best effort
        }
        long maxBytes = 50L * 1024L * 1024L;
        if (contentLength > maxBytes) {
          sendText(exchange, 413, "file too large (max 50MB)");
          return;
        }

        byte[] body;
        try (InputStream in = exchange.getRequestBody();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
          byte[] buf = new byte[16 * 1024];
          int n;
          long total = 0;
          while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > maxBytes) {
              sendText(exchange, 413, "file too large (max 50MB)");
              return;
            }
            out.write(buf, 0, n);
          }
          body = out.toByteArray();
        }

        if (body.length == 0) {
          sendText(exchange, 400, "empty body — POST the .mpp bytes");
          return;
        }

        // Stream to a temp file so MPXJ can read with its file APIs (more
        // tested code paths than ByteArrayInputStream).
        File tmpIn = File.createTempFile("mpp-", ".mpp");
        File tmpOut = File.createTempFile("mspdi-", ".xml");
        try {
          Files.write(tmpIn.toPath(), body);

          ProjectFile project;
          // UniversalProjectReader sniffs the format — handles .mpp, .xml,
          // .mpx, Primavera, etc. Falls back to MPPReader for ambiguous
          // OLE2 streams.
          try {
            project = new UniversalProjectReader().read(tmpIn);
          } catch (Exception universalErr) {
            project = new MPPReader().read(tmpIn);
          }

          if (project == null) {
            sendText(exchange, 422, "could not parse: file did not yield a valid MS Project structure");
            return;
          }

          new MSPDIWriter().write(project, tmpOut);
          byte[] xml = Files.readAllBytes(tmpOut.toPath());

          exchange.getResponseHeaders().add("Content-Type", "application/xml; charset=utf-8");
          exchange.sendResponseHeaders(200, xml.length);
          try (OutputStream os = exchange.getResponseBody()) {
            os.write(xml);
          }
        } catch (Exception e) {
          e.printStackTrace();
          sendText(exchange, 500, "conversion failed: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        } finally {
          // Best-effort cleanup.
          //noinspection ResultOfMethodCallIgnored
          tmpIn.delete();
          //noinspection ResultOfMethodCallIgnored
          tmpOut.delete();
        }
      } catch (Throwable t) {
        // Last-ditch — never leak a stacktrace to the client.
        t.printStackTrace();
        try {
          sendText(exchange, 500, "internal error");
        } catch (IOException ignored) {
          // exchange already closed
        }
      }
    }
  }

  private static void sendText(HttpExchange exchange, int status, String body) throws IOException {
    byte[] bytes = body.getBytes("UTF-8");
    exchange.getResponseHeaders().add("Content-Type", "text/plain; charset=utf-8");
    // HEAD responses MUST NOT carry a body per RFC 7230. JDK's HttpServer
    // throws IOException ("stream closed") if you try to write one after
    // sendResponseHeaders with a non-zero length. Detect the method and
    // signal "headers only" by passing -1.
    final boolean isHead = "HEAD".equalsIgnoreCase(exchange.getRequestMethod());
    if (isHead) {
      // Set Content-Length manually since we're using -1 (no body).
      exchange.getResponseHeaders().add("Content-Length", Integer.toString(bytes.length));
      exchange.sendResponseHeaders(status, -1);
      exchange.close();
      return;
    }
    exchange.sendResponseHeaders(status, bytes.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(bytes);
    }
  }
}
