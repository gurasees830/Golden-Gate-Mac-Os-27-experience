package dev.goldengate.user;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AccountUserDetailsService implements UserDetailsService {
  private final UserRepository users;

  public AccountUserDetailsService(UserRepository users) {
    this.users = users;
  }

  @Override
  public UserDetails loadUserByUsername(String email) {
    var u = users.findByEmailIgnoreCase(email).orElseThrow(() -> new UsernameNotFoundException("No such account"));
    return User.withUsername(u.getEmail()).password(u.getPasswordHash()).roles("USER").build();
  }
}
