package dev.goldengate.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Session-cookie authentication (no tokens in localStorage) with a CSRF token
 * in a readable XSRF-TOKEN cookie that the SPA echoes in the X-XSRF-TOKEN header.
 */
@Configuration
public class SecurityConfig {

  @Bean
  SecurityFilterChain api(HttpSecurity http, ObjectMapper json, CorsConfigurationSource cors) throws Exception {
    var csrfHandler = new CsrfTokenRequestAttributeHandler();
    csrfHandler.setCsrfRequestAttributeName(null); // plain (non-masked) token, as SPAs read it from the cookie
    var csrfRepo = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfRepo.setCookieCustomizer(c -> c.sameSite("Lax").path("/"));

    http.cors(c -> c.configurationSource(cors))
        .csrf(c -> c.csrfTokenRepository(csrfRepo).csrfTokenRequestHandler(csrfHandler))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED).sessionFixation(f -> f.changeSessionId()))
        .securityContext(c -> c.securityContextRepository(securityContextRepository()))
        .authorizeHttpRequests(a -> a
            .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
            .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
            .requestMatchers("/actuator/health/**", "/actuator/info", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
            .anyRequest().authenticated())
        .exceptionHandling(e -> e
            .authenticationEntryPoint((req, res, ex) -> write(res, json, HttpStatus.UNAUTHORIZED, "Sign in to use Golden Gate Cloud."))
            .accessDeniedHandler((req, res, ex) -> write(res, json, HttpStatus.FORBIDDEN, "Request blocked (missing or invalid CSRF token).")))
        .headers(h -> h.contentSecurityPolicy(c -> c.policyDirectives("default-src 'none'; frame-ancestors 'none'")))
        .formLogin(f -> f.disable())
        .httpBasic(b -> b.disable())
        .logout(l -> l.disable());
    return http.build();
  }

  private static void write(jakarta.servlet.http.HttpServletResponse res, ObjectMapper json, HttpStatus status, String message) throws java.io.IOException {
    res.setStatus(status.value());
    res.setContentType(MediaType.APPLICATION_JSON_VALUE);
    json.writeValue(res.getOutputStream(), Map.of("status", status.value(), "message", message));
  }

  @Bean
  SecurityContextRepository securityContextRepository() {
    return new HttpSessionSecurityContextRepository();
  }

  @Bean
  PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder(); // bcrypt by default
  }

  @Bean
  AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder encoder) {
    var provider = new DaoAuthenticationProvider(users);
    provider.setPasswordEncoder(encoder);
    return new ProviderManager(provider);
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(AppProperties props) {
    var cfg = new CorsConfiguration();
    cfg.setAllowedOrigins(props.allowedOrigins());
    cfg.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    cfg.setAllowedHeaders(java.util.List.of("Content-Type", "X-XSRF-TOKEN"));
    cfg.setAllowCredentials(true);
    cfg.setMaxAge(3600L);
    var src = new UrlBasedCorsConfigurationSource();
    src.registerCorsConfiguration("/api/**", cfg);
    return src;
  }
}
