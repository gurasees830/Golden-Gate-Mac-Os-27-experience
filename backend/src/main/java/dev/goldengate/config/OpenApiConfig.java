package dev.goldengate.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {
  @Bean
  OpenAPI goldenGateApi() {
    return new OpenAPI().info(new Info()
        .title("Golden Gate Cloud API")
        .version("1.0.0")
        .description("Accounts and preference sync for the Golden Gate browser-based desktop simulator. "
            + "Authentication uses an HttpOnly session cookie; state-changing requests need the X-XSRF-TOKEN header."));
  }
}
