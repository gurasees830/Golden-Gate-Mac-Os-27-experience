# --- build ---
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B package -DskipTests

# --- run ---
FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /src/target/golden-gate-cloud-*.jar app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://localhost:8080/actuator/health/readiness || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
