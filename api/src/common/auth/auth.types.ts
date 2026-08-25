import { UserRole } from '@prisma/client';

/** Usuário autenticado anexado à requisição (req.user). */
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string;
  type?: 'access' | 'refresh';
}
