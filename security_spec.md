# Security Specification for GourmetPlaner

## Data Invariants
1. A recipe must have a valid `userId` matching the authenticated user.
2. Users can only read, update, or delete their own recipes.
3. A shopping list must correspond to the user's ID.
4. Timestamps (createdAt, updatedAt) must be server-validated.
5. Ratings must be between 1 and 5.
6. IDs must follow the `isValidId` pattern.

## The Dirty Dozen Payloads (Deny Cases)
1. **Identity Spoofing**: Creating a recipe with someone else's `userId`.
2. **Access Violation**: Reading another user's recipe by knowing its ID.
3. **Malicious ID**: Using a 2KB string as a recipe ID to cause resource exhaustion.
4. **Invalid Type**: Setting `rating` as a string instead of a number.
5. **Range Error**: Setting `rating` to 10.
6. **Shadow Field**: Adding `isAdmin: true` to a recipe document.
7. **Timestamp Fraud**: Providing a manual `createdAt` in the past instead of `request.time`.
8. **Shopping List Theft**: Updating another user's shopping list.
9. **Enum Violation**: Setting `type` to "Alien Food" (not in allowed enums).
10. **Array Explosion**: Sending an `ingredients` array with 10,000 items.
11. **PII Leak**: If we had user profiles, trying to read private info (not applicable here yet, but good to keep in mind).
12. **Bypassing Invariants**: Attempting to set `carbs` to -50.

## Test Runner (Planned)
The `firestore.rules.test.ts` will use `@firebase/rules-unit-testing` to verify these denials.
