package dev.goldengate.auth;

import dev.goldengate.auth.AuthDtos.LoginRequest;
import dev.goldengate.auth.AuthDtos.RegisterRequest;
import dev.goldengate.auth.AuthDtos.UserView;
import dev.goldengate.common.ApiError;
import dev.goldengate.user.UserAccount;
import dev.goldengate.user.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final UserRepository users;
  private final PasswordEncoder encoder;
  private final AuthenticationManager authManager;
  private final SecurityContextRepository contextRepo;
  private final LoginAttemptService attempts;

  public AuthController(UserRepository users, PasswordEncoder encoder, AuthenticationManager authManager, SecurityContextRepository contextRepo, LoginAttemptService attempts) {
    this.users = users;
    this.encoder = encoder;
    this.authManager = authManager;
    this.contextRepo = contextRepo;
    this.attempts = attempts;
  }

  @Operation(summary = "Issue the CSRF cookie (call once before the first POST)")
  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
  }

  @Operation(summary = "Create an account and sign in")
  @PostMapping("/register")
  @Transactional
  public ResponseEntity<UserView> register(@Valid @RequestBody RegisterRequest body, HttpServletRequest req, HttpServletResponse res) {
    String email = body.email().trim().toLowerCase(Locale.ROOT);
    if (users.existsByEmailIgnoreCase(email)) throw new ApiError(HttpStatus.CONFLICT, "An account with this email already exists.");
    var user = users.save(new UserAccount(email, body.displayName().trim(), encoder.encode(body.password())));
    signIn(email, body.password(), req, res);
    return ResponseEntity.status(HttpStatus.CREATED).body(UserView.of(user));
  }

  @Operation(summary = "Sign in with email and password (sets an HttpOnly session cookie)")
  @PostMapping("/login")
  public UserView login(@Valid @RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
    String email = body.email().trim().toLowerCase(Locale.ROOT);
    String key = email + "|" + req.getRemoteAddr();
    if (attempts.isLocked(key)) throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes.");
    try {
      signIn(email, body.password(), req, res);
    } catch (AuthenticationException e) {
      attempts.failed(key);
      throw new BadCredentialsException("bad credentials");
    }
    attempts.succeeded(key);
    return UserView.of(users.findByEmailIgnoreCase(email).orElseThrow());
  }

  @Operation(summary = "Sign out and invalidate the session")
  @PostMapping("/logout")
  public ResponseEntity<Void> logout(HttpServletRequest req) {
    var session = req.getSession(false);
    if (session != null) session.invalidate();
    SecurityContextHolder.clearContext();
    return ResponseEntity.noContent().build();
  }

  @Operation(summary = "The signed-in account")
  @GetMapping("/me")
  public UserView me(Principal principal) {
    return users.findByEmailIgnoreCase(principal.getName()).map(UserView::of)
        .orElseThrow(() -> new ApiError(HttpStatus.UNAUTHORIZED, "Session expired."));
  }

  private void signIn(String email, String password, HttpServletRequest req, HttpServletResponse res) {
    var auth = authManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, password));
    if (req.getSession(false) != null) req.changeSessionId(); // prevent session fixation
    var ctx = SecurityContextHolder.createEmptyContext();
    ctx.setAuthentication(auth);
    SecurityContextHolder.setContext(ctx);
    contextRepo.saveContext(ctx, req, res);
  }
}
