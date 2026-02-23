/**
 * API Client barrel export
 *
 * @module src/lib/api
 */

export {
    clinicians,
    engagements,
    assignments,
    prospects,
    clicks,
    candidates,
    apiClient,
} from "./client";

export type {
    ClinicianParams,
    EngagementParams,
    AssignmentParams,
    ApiError,
} from "./client";

export { default } from "./client";
