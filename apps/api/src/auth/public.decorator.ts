import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route/controller as exempt from JwtAuthGuard + RolesGuard (ADR-0002). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
