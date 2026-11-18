/**
 * Cantill.ai Service Layer Foundation
 *
 * Encapsulates domain business logic, data access, and transactional flows.
 * Specific procurement services will be built in subsequent phases.
 */

export interface BaseServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
