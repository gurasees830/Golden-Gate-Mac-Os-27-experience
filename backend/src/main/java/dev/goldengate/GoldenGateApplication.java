package dev.goldengate;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/** Optional cloud service for the Golden Gate browser-based desktop simulator. */
@SpringBootApplication
@ConfigurationPropertiesScan
public class GoldenGateApplication {
  public static void main(String[] args) {
    SpringApplication.run(GoldenGateApplication.class, args);
  }
}
