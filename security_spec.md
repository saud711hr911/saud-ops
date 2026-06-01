# Security Specification: Operations Center

This document outlines the zero-trust data invariants, threat model payloads ("The Dirty Dozen"), and validation criteria for the Operations Center web application.

## 1. Data Invariants
- **Identity Integrity**: All written files/user profiles must align their internal client/employee UID fields to `request.auth.uid`. No user can impersonate another user of any role, nor self-assign private settings.
- **Bootstrapped Admin**: The user email `saud711hr@gmail.com` registers automatically as `admin`. Any other self-registered user is restricted to the `client` role unless upgraded by an administrator.
- **Relational Integrity**: Comments and tasks must belong to existing requests. Access is synchronized dynamically with the corresponding parent request's ownership or assignment state.
- **Terminal State Protection**: Once a Request is updated to `Closed` status, it cannot be modified by a client or standard employee; only an administrator can override a closed request state.
- **Strict Keys**: Shadow fields are blocked on write. Schema validation enforces exactly the set of necessary keys on document creation, preventing shadow field injection attacks.

## 2. The Dirty Dozen (Threat Vectors & Relational Payloads)
The following payloads constitute potential attacks that our security rule schema must block:

1. **Self-Appointed Administrator**: A client attempts to create or update their own user profile document with role set to `admin`.
2. **Identity Spoofing**: User `A` tries to write a request with `clientId` set to User `B` to make payments or lookups in their name.
3. **Privilege Escalation in Profile Creation**: A user registry payload omitting vital fields or setting arbitrary flags.
4. **Terminal Bypass**: Client trying to alter descriptions of an already `Closed` request.
5. **Orphaned Writes**: Writing a comment to non-existent requestId or to a request that is not owned/assigned to the sender.
6. **Denial of Wallet on Document ID**: Attacker attempts to write a document with a 1.5KB string containing junk characters as the document ID.
7. **Value Poisoning in Request Status**: Attacker sets the request `status` to an unapproved custom string like `Premium_Refunded` or `Urgent_System_Fail`.
8. **Employee Reassignment Hijack**: A client updates their request and changes the `assignedEmployeeId` to an empty string or fields of another employee.
9. **Shadow Field Injection**: Creating a request with a malicious hidden status override flag like `{"status": "New", "is_emergency_bypass_approved": true}`.
10. **Array Overloading**: Attacker submits an attachment collection with 10,000 sub-entries, consuming maximum memory/index bandwidth.
11. **Client Reading Foreign Request**: Client `C1` attempts to do a direct query on `/requests/R2` where request `R2` belongs to client `C2` (Must reject at rule-level).
12. **Comment Impersonation**: Posting an internal comment on a request but claiming to be an administrator (`authorRole: "admin"`) while holding a Client profile.

## 3. Test Cases Configuration and Simulation Guide
A simulation and validation matrix verifies that each of the Dirty Dozen threat payloads is rejected with a clear `PERMISSION_DENIED` error from the Firebase rules engine. Every field write starts on the client with verification checks and ends in the Firestore validation engine.
