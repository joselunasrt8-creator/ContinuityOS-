# MindShift Legitimacy State Machine v1

Valid path: PROPOSED → AUTHORIZED → VALIDATED → EXECUTABLE → EXECUTED → PROVEN → CONSUMED.

Invalid transition resolves NULL. Forbidden transitions include PROPOSED → EXECUTED, AUTHORIZED → EXECUTED, VALIDATED → PROVEN without EXECUTED, EXECUTED → EXECUTED replay, CONSUMED → EXECUTABLE, and REVOKED → any execution state.
