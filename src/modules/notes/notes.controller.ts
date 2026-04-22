import { Request, Response } from 'express';
import { listNotes, createNote, deleteNote } from './notes.service';
import { sendSuccess, sendError } from '../../utils/response';

export async function handleList(req: Request, res: Response): Promise<void> {
  try {
    const notes = await listNotes(req.params.candidateId);
    sendSuccess(res, notes);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to fetch notes');
  }
}

export async function handleCreate(req: Request, res: Response): Promise<void> {
  try {
    const note = await createNote(req.params.candidateId, req.user!.userId, req.body);
    if (!note) {
      sendError(res, 404, 'Candidate not found');
      return;
    }
    sendSuccess(res, note, 201);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to create note');
  }
}

export async function handleDelete(req: Request, res: Response): Promise<void> {
  try {
    const result = await deleteNote(req.params.noteId, req.user!.userId, req.user!.role);
    if (result === false) {
      sendError(res, 404, 'Note not found');
      return;
    }
    if (result === null) {
      sendError(res, 403, 'You do not have permission to delete this note');
      return;
    }
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to delete note');
  }
}
