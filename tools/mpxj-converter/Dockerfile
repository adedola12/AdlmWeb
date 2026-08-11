# ─────────────────────────────────────────────────────────────────────
# ADLM MPXJ Converter — multi-stage Docker build
#
# Stage 1: Maven + JDK 17 to compile the shaded uberjar.
# Stage 2: Lean JRE-only runtime that just runs the jar.
#
# Image is ~180 MB and starts in <1 s. Set MPXJ_API_KEY at deploy time
# if you want HTTP auth (recommended for public URLs).
#
# RUNS IN TWO PLACES, UNCHANGED. The AWS Lambda Web Adapter is copied in
# as a Lambda *extension*, and Lambda is the only thing that ever executes
# /opt/extensions. Anywhere else — plain `docker run`, App Runner, ECS,
# local — the file is inert dead weight (about 5 MB) and the CMD below
# starts the same HTTP server on $PORT it always did. So there is one
# image and one code path, not a Lambda fork.
# ─────────────────────────────────────────────────────────────────────

FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /build

# Copy pom first so Maven can cache the dependency layer.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ─────────────────────────────────────────────────────────────────────

FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

COPY --from=build /build/target/mpxj-converter.jar /app/mpxj-converter.jar

# AWS Lambda Web Adapter. Only Lambda executes /opt/extensions, so this is
# a no-op everywhere else. Pinned rather than :latest — an adapter that
# changes its readiness or streaming behaviour under us would look like a
# converter bug, and this service is only touched a few times a week, so a
# regression could sit unnoticed for a long time.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 \
     /lambda-adapter /opt/extensions/lambda-adapter

# Render / Railway / Fly inject $PORT; we honour it in Main.java (default 8080).
# The adapter also defaults to 8080, so the two agree without being told.
EXPOSE 8080

# Poll /health, not /. The adapter's default readiness probe is GET / and
# ConvertHandler answers that with 404, which the adapter would treat as
# "up" only by accident. /health returns a real 200.
ENV AWS_LWA_READINESS_CHECK_PATH="/health"

# Stream the response instead of buffering it. NOT optional, and not a
# performance tweak: a buffered Lambda response is capped at 6 MB, and
# MSPDI XML is far more verbose than the .mpp it came from — a 2 MB
# programme with a couple of thousand tasks can emit well over 6 MB of
# XML. Buffered, that fails at the Lambda boundary AFTER a successful
# conversion, which is the worst possible place to lose the work.
# Must be paired with invokeMode: RESPONSE_STREAM on the Function URL.
ENV AWS_LWA_INVOKE_MODE="response_stream"

# Heap was 384m for a 512 MB Render container. Lambda gives 2 GB (and CPU
# scales with memory), and MPXJ holds the whole project graph in memory
# while writing, so give it room. Still well under the container limit,
# leaving headroom for the JVM's own non-heap use.
# SerialGC because a Lambda container serves one request at a time on
# roughly one vCPU, where G1's concurrent threads cost more than they save.
# Deliberately NOT -XX:TieredStopAtLevel=1: that classic cold-start trick
# only pays when the work is sub-second, and MPXJ parsing is seconds of
# real CPU, so keeping the C2 compiler is the better trade here.
ENV JAVA_OPTS="-Xms128m -Xmx1280m -XX:+UseSerialGC"

# Tini-style PID-1 handling isn't strictly required for a single JVM
# process — the JVM handles SIGTERM correctly via the Server.stop hook
# Render sends on deploys.
CMD ["sh", "-c", "exec java $JAVA_OPTS -jar /app/mpxj-converter.jar"]
