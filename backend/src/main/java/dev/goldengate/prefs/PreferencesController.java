package dev.goldengate.prefs;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.goldengate.common.ApiError;
import dev.goldengate.config.AppProperties;
import dev.goldengate.user.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Stores the simulator's appearance/Dock/desktop preferences as one JSON document per account. */
@RestController
@RequestMapping("/api/preferences")
public class PreferencesController {
  public record PreferencesBody(@NotNull String data) {}

  public record PreferencesView(String data, Instant updatedAt) {}

  private final UserPreferencesRepository prefs;
  private final UserRepository users;
  private final ObjectMapper json;
  private final AppProperties props;

  public PreferencesController(UserPreferencesRepository prefs, UserRepository users, ObjectMapper json, AppProperties props) {
    this.prefs = prefs;
    this.users = users;
    this.json = json;
    this.props = props;
  }

  @Operation(summary = "Get the signed-in account's synced preferences")
  @GetMapping
  public PreferencesView get(Principal principal) {
    Long uid = userId(principal);
    return prefs.findById(uid).map(p -> new PreferencesView(p.getData(), p.getUpdatedAt())).orElse(new PreferencesView("{}", null));
  }

  @Operation(summary = "Replace the signed-in account's synced preferences (a JSON object, max 256 KB)")
  @PutMapping
  @Transactional
  public PreferencesView put(@Valid @RequestBody PreferencesBody body, Principal principal) {
    if (body.data().getBytes(StandardCharsets.UTF_8).length > props.maxPreferenceBytes())
      throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, "Preferences are too large to sync.");
    try {
      JsonNode node = json.readTree(body.data());
      if (node == null || !node.isObject()) throw new ApiError(HttpStatus.BAD_REQUEST, "Preferences must be a JSON object.");
    } catch (JsonProcessingException e) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "Preferences must be valid JSON.");
    }
    Long uid = userId(principal);
    var p = prefs.findById(uid).orElseGet(() -> new UserPreferences(uid, body.data()));
    p.update(body.data());
    p = prefs.save(p);
    return new PreferencesView(p.getData(), p.getUpdatedAt());
  }

  private Long userId(Principal principal) {
    return users.findByEmailIgnoreCase(principal.getName()).orElseThrow(() -> new ApiError(HttpStatus.UNAUTHORIZED, "Session expired.")).getId();
  }
}
