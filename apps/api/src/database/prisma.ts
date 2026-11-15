import {PrismaClient} from '@prisma/client';

// Credentials are never part of a default project read; fetch them with an explicit select.
export const prisma = new PrismaClient({omit: {project: {turnstileSecret: true}}});
