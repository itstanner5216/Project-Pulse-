"use strict";
/**
 * Commands module - CLI commands for delegation.
 *
 * These commands integrate with the main ProjectPulse CLI.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.delegationList = exports.delegationRead = exports.delegate = void 0;
var delegate_1 = require("./delegate");
Object.defineProperty(exports, "delegate", { enumerable: true, get: function () { return delegate_1.delegate; } });
var delegation_read_1 = require("./delegation-read");
Object.defineProperty(exports, "delegationRead", { enumerable: true, get: function () { return delegation_read_1.delegationRead; } });
var delegation_list_1 = require("./delegation-list");
Object.defineProperty(exports, "delegationList", { enumerable: true, get: function () { return delegation_list_1.delegationList; } });
//# sourceMappingURL=index.js.map