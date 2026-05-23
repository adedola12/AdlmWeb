# ─────────────────────────────────────────────────────────────────────
# ADLM MPXJ Converter — multi-stage Docker build
#
# Stage 1: Maven + JDK 17 to compile the shaded uberjar.
# Stage 2: Lean JRE-only runtime that just runs the jar.
#
# Image is ~180 MB and starts in <1 s. Set MPXJ_API_KEY at deploy time
# if you want HTTP auth (recommended for public URLs).
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

# Render / Railway / Fly inject $PORT; we honour it in Main.java (default 8080).
EXPOSE 8080
ENV JAVA_OPTS="-Xms64m -Xmx384m"

# Tini-style PID-1 handling isn't strictly required for a single JVM
# process — the JVM handles SIGTERM correctly via the Server.stop hook
# Render sends on deploys.
CMD ["sh", "-c", "exec java $JAVA_OPTS -jar /app/mpxj-converter.jar"]
