import { prisma } from '../../lib/prisma';
import { CreateNoteInput } from './notes.types';

const noteSelect = {
  id: true,
  content: true,
  createdAt: true,
  candidateId: true,
  user: { select: { id: true, name: true } },
};

export async function listNotes(candidateId: string) {
  return prisma.note.findMany({
    where: { candidateId },
    select: noteSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export async function createNote(candidateId: string, userId: string, input: CreateNoteInput) {
  // Verify candidate exists
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) return null;

  const note = await prisma.note.create({
    data: { candidateId, userId, content: input.content },
    select: noteSelect,
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CREATE',
      entityType: 'Note',
      entityId: note.id,
      metadata: { candidateId },
    },
  });

  return note;
}

export async function deleteNote(noteId: string, userId: string, userRole: string) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { id: true, userId: true },
  });

  if (!note) return false;

  // Only note author or admin can delete
  if (note.userId !== userId && userRole !== 'ADMIN') return null;

  await prisma.note.delete({ where: { id: noteId } });
  return true;
}
