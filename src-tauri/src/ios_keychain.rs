//! The iOS half of `secret_set` / `secret_get` / `secret_delete`.
//!
//! `keyring` writes iOS items through `security_framework::passwords`, which
//! never sets `kSecAttrAccessible` and so takes the system default,
//! `kSecAttrAccessibleWhenUnlocked`. Every Gmail refresh token and the Maru
//! account key would then be unreadable until the person first unlocks the
//! phone after a reboot — and a content-free push (MARU-ACCOUNT.md §9) wakes
//! Maru in exactly that window. The fetch would fail silently and the mail
//! would arrive whenever the phone was next opened, which is the one thing
//! push exists to prevent.
//!
//! So iOS writes its own items with `kSecAttrAccessibleAfterFirstUnlock`:
//! readable in the background from the first unlock after boot onward, still
//! protected while the device has never been unlocked. Deliberately not
//! `...ThisDeviceOnly`: these items are already excluded from iCloud Keychain
//! by not asking for `kSecAttrSynchronizable`, and an encrypted-backup restore
//! onto a new phone is a path Maru wants to keep.
//!
//! Item shape — class, service, account — matches `keyring`'s iOS credential
//! exactly, so entries written by an earlier build are still found.

use core_foundation::base::{CFType, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::data::CFData;
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::CFString;
use core_foundation_sys::base::CFTypeRef;
use core_foundation_sys::data::CFDataRef;
use core_foundation_sys::string::CFStringRef;
use security_framework_sys::access_control::kSecAttrAccessibleAfterFirstUnlock;
use security_framework_sys::base::{errSecItemNotFound, errSecSuccess};
use security_framework_sys::item::{
  kSecAttrAccount, kSecAttrService, kSecClass, kSecClassGenericPassword, kSecMatchLimit,
  kSecReturnData, kSecValueData,
};
use security_framework_sys::keychain_item::{SecItemAdd, SecItemCopyMatching, SecItemDelete};

// security-framework-sys does not re-export either of these.
#[link(name = "Security", kind = "framework")]
extern "C" {
  static kSecAttrAccessible: CFStringRef;
  static kSecMatchLimitOne: CFStringRef;
}

fn key_string(raw: CFStringRef) -> CFString {
  unsafe { CFString::wrap_under_get_rule(raw) }
}

/// Class, service and account: the three attributes that name one item.
fn identity(service: &str, key: &str) -> Vec<(CFString, CFType)> {
  vec![
    (
      key_string(unsafe { kSecClass }),
      key_string(unsafe { kSecClassGenericPassword }).as_CFType(),
    ),
    (
      key_string(unsafe { kSecAttrService }),
      CFString::new(service).as_CFType(),
    ),
    (
      key_string(unsafe { kSecAttrAccount }),
      CFString::new(key).as_CFType(),
    ),
  ]
}

fn fail(status: i32, what: &str) -> String {
  format!("keychain {what} failed with OSStatus {status}")
}

/// Write `value` under `key`, replacing whatever was there.
///
/// Delete-then-add rather than `SecItemUpdate`: an update leaves the original
/// item's accessibility attribute in place, so an entry written by an earlier
/// build would keep `WhenUnlocked` forever. Recreating it re-stamps the
/// attribute on every write, which is what migrates the existing keychain
/// without a migration step.
pub fn set(service: &str, key: &str, value: &str) -> Result<(), String> {
  delete(service, key)?;
  let mut pairs = identity(service, key);
  pairs.push((
    key_string(unsafe { kSecValueData }),
    CFData::from_buffer(value.as_bytes()).as_CFType(),
  ));
  pairs.push((
    key_string(unsafe { kSecAttrAccessible }),
    key_string(unsafe { kSecAttrAccessibleAfterFirstUnlock }).as_CFType(),
  ));
  let attributes = CFDictionary::from_CFType_pairs(&pairs);
  let status = unsafe { SecItemAdd(attributes.as_concrete_TypeRef(), std::ptr::null_mut()) };
  if status == errSecSuccess {
    Ok(())
  } else {
    Err(fail(status, "write"))
  }
}

/// Read the value under `key`. `None` when no item exists.
pub fn get(service: &str, key: &str) -> Result<Option<String>, String> {
  let mut pairs = identity(service, key);
  pairs.push((
    key_string(unsafe { kSecReturnData }),
    CFBoolean::true_value().as_CFType(),
  ));
  pairs.push((
    key_string(unsafe { kSecMatchLimit }),
    key_string(unsafe { kSecMatchLimitOne }).as_CFType(),
  ));
  let query = CFDictionary::from_CFType_pairs(&pairs);
  let mut found: CFTypeRef = std::ptr::null();
  let status = unsafe { SecItemCopyMatching(query.as_concrete_TypeRef(), &mut found) };
  if status == errSecItemNotFound {
    return Ok(None);
  }
  if status != errSecSuccess {
    return Err(fail(status, "read"));
  }
  if found.is_null() {
    return Ok(None);
  }
  let data = unsafe { CFData::wrap_under_create_rule(found as CFDataRef) };
  String::from_utf8(data.to_vec())
    .map(Some)
    .map_err(|e| e.to_string())
}

/// Delete the item under `key`. A missing item is not an error.
pub fn delete(service: &str, key: &str) -> Result<(), String> {
  let query = CFDictionary::from_CFType_pairs(&identity(service, key));
  let status = unsafe { SecItemDelete(query.as_concrete_TypeRef()) };
  if status == errSecSuccess || status == errSecItemNotFound {
    Ok(())
  } else {
    Err(fail(status, "delete"))
  }
}
