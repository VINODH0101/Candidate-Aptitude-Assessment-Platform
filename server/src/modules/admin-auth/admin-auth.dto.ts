import type { Admin } from '@prisma/client';

export interface AdminDto {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

type AdminLike = Pick<Admin, 'id' | 'email' | 'name' | 'createdAt'>;

export function toAdminDto(admin: AdminLike): AdminDto {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    createdAt: admin.createdAt.toISOString(),
  };
}
