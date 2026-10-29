package dev.goldengate;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthAndPreferencesTest {
  @Autowired MockMvc mvc;

  private HttpSession register(String email) throws Exception {
    var res = mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"" + email + "\",\"password\":\"correct horse\",\"displayName\":\"Ada\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.email").value(email.toLowerCase()))
        .andExpect(jsonPath("$.passwordHash").doesNotExist())
        .andReturn();
    return res.getRequest().getSession(false);
  }

  @Test
  void csrfEndpointIssuesReadableCookie() throws Exception {
    mvc.perform(get("/api/auth/csrf"))
        .andExpect(status().isOk())
        .andExpect(cookie().exists("XSRF-TOKEN"))
        .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
  }

  @Test
  void writesWithoutCsrfAreRejected() throws Exception {
    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"a@b.co\",\"password\":\"whatever1\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void registerSignsInAndMeReturnsTheAccount() throws Exception {
    var session = (MockHttpSession) register("Ada@Example.com");
    mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Ada"));
  }

  @Test
  void duplicateEmailIsAConflict() throws Exception {
    register("dup@example.com");
    mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"DUP@example.com\",\"password\":\"correct horse\",\"displayName\":\"Ada\"}"))
        .andExpect(status().isConflict());
  }

  @Test
  void anonymousRequestsGet401() throws Exception {
    mvc.perform(get("/api/preferences")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message", containsString("Sign in")));
  }

  @Test
  void loginLogoutAndLockout() throws Exception {
    register("lock@example.com");
    String good = "{\"email\":\"lock@example.com\",\"password\":\"correct horse\"}";
    String bad = "{\"email\":\"lock@example.com\",\"password\":\"wrong pass\"}";
    var ok = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(good)).andExpect(status().isOk()).andReturn();
    var session = (MockHttpSession) ok.getRequest().getSession(false);
    mvc.perform(post("/api/auth/logout").with(csrf()).session(session)).andExpect(status().isNoContent());
    for (int i = 0; i < 3; i++)
      mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(good)).andExpect(status().isTooManyRequests());
  }

  @Test
  void preferencesRoundTripAndValidation() throws Exception {
    var session = (MockHttpSession) register("prefs@example.com");
    mvc.perform(get("/api/preferences").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.data").value("{}"));
    mvc.perform(put("/api/preferences").with(csrf()).session(session).contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":\"{\\\"appearance\\\":\\\"dark\\\"}\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.updatedAt").isNotEmpty());
    mvc.perform(get("/api/preferences").session(session)).andExpect(jsonPath("$.data", containsString("dark")));
    mvc.perform(put("/api/preferences").with(csrf()).session(session).contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"[1,2]\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(put("/api/preferences").with(csrf()).session(session).contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"not json\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void healthIsPublic() throws Exception {
    mvc.perform(get("/actuator/health")).andExpect(status().isOk());
  }
}
