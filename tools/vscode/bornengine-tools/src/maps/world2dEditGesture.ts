import type { World2DDocument } from '@bornengine/engine/world2d/editor';
import { applyWorld2DEdit } from './world2dEdits';
import type { World2DEditOperation } from './world2dEdits';

export interface World2DEditGestureResult {
  document: World2DDocument;
  operations: World2DEditOperation[];
}

export class World2DEditGesture {
  private readonly startingDocument: World2DDocument;
  private pendingOperations: World2DEditOperation[] = [];
  private closed = false;
  document: World2DDocument;

  constructor(document: World2DDocument) {
    this.startingDocument = document;
    this.document = document;
  }

  apply(operation: World2DEditOperation): World2DDocument {
    this.assertOpen();
    this.document = applyWorld2DEdit(this.document, operation);
    this.pendingOperations.push(operation);
    return this.document;
  }

  commit(): World2DEditGestureResult {
    this.assertOpen();
    this.closed = true;
    return { document: this.document, operations: this.pendingOperations.slice() };
  }

  cancel(): World2DDocument {
    this.assertOpen();
    this.closed = true;
    this.pendingOperations = [];
    this.document = this.startingDocument;
    return this.startingDocument;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('World2D edit gesture has already been completed.');
  }
}
