import { AsyncPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroupDirective, FormRecord, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  catchError,
  defer,
  distinctUntilChanged,
  finalize,
  map,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { CellField, EditorValue, KafkaCellDefinition } from './kafka-cell-definition';
import { completionObservable, errorMessage } from './kafka-cell-utils';

let nextCellId = 0;

@Component({
  selector: 'app-kafka-cell',
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './kafka-cell.html',
  styleUrl: './kafka-cell.scss',
})
export class KafkaCell<T extends Record<string, unknown>> {
  readonly definition = input.required<KafkaCellDefinition<T>>();
  protected readonly cellId = `kafka-cell-${nextCellId++}`;
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly pending = signal(false);
  protected readonly feedback = signal('');
  protected readonly failed = signal(false);

  protected readonly state = computed(() => {
    const definition = this.definition();
    const fields = definition.fields.map((field) => {
      const control = new FormControl<EditorValue>(
        field.format(definition.initialValues[field.key]),
        {
          validators: (control) => {
            try {
              field.parse(control.value);
              return null;
            } catch (error) {
              return { payload: errorMessage(error) };
            }
          },
        },
      );
      const completionError = signal('');
      const suggestions = control.valueChanges.pipe(
        startWith(control.value),
        map((value) => String(value ?? '')),
        distinctUntilChanged(),
        // Switch immediately to cancel stale lookups, including during the debounce.
        switchMap((query) =>
          timer(150).pipe(
            switchMap(() =>
              defer(() => {
                completionError.set('');
                return field.complete ? completionObservable(field.complete(query)) : of([]);
              }),
            ),
            catchError(() => {
              completionError.set('Suggestions unavailable. You can still enter a value.');
              return of([]);
            }),
            startWith([] as readonly string[]),
          ),
        ),
      );
      return { ...field, control, suggestions, completionError };
    });
    const form = new FormRecord(
      Object.fromEntries(fields.map((field) => [field.key, field.control])),
    );
    return { fields, form };
  });

  protected send(formElement: HTMLFormElement): void {
    if (this.pending()) return;
    const { fields, form } = this.state();
    form.markAllAsTouched();
    if (form.invalid) {
      this.failed.set(true);
      this.feedback.set('Review the highlighted fields.');
      const invalid = fields.find((field) => field.control.invalid);
      Array.from(
        formElement.querySelectorAll<HTMLElement>('input, textarea, mat-select, mat-checkbox'),
      )
        .find((element) => element.id === `${this.cellId}-${invalid?.key}`)
        ?.focus();
      return;
    }
    this.submit(() =>
      this.definition().createPayload(
        Object.fromEntries(fields.map((field) => [field.key, field.parse(field.control.value)])),
      ),
    );
  }

  protected sendPreset(preset: KafkaCellDefinition<T>['presets'][number]): void {
    this.submit(preset.createPayload);
  }

  protected reset(form: FormGroupDirective): void {
    if (this.pending()) return;
    form.resetForm(
      Object.fromEntries(
        this.state().fields.map((field) => [
          field.key,
          field.format(this.definition().initialValues[field.key]),
        ]),
      ),
    );
    this.feedback.set('');
    this.failed.set(false);
  }

  protected toggleNull(field: CellField & { control: FormControl<EditorValue> }): void {
    const empty =
      field.kind === 'boolean' ? false : field.kind === 'select' ? (field.options[0] ?? '') : '';
    field.control.setValue(field.control.value === null ? empty : null);
    field.control.markAsDirty();
    this.clearFeedback();
  }

  protected clearFeedback(): void {
    if (!this.pending()) this.feedback.set('');
  }

  private submit(createPayload: () => T): void {
    if (this.pending()) return;
    this.failed.set(false);
    try {
      const definition = this.definition();
      const body = definition.serialize(createPayload());
      this.pending.set(true);
      this.feedback.set('Sending…');
      this.http
        .post(definition.endpoint, body, { headers: definition.headers, responseType: 'text' })
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.pending.set(false)),
        )
        .subscribe({
          next: () => this.feedback.set('Message sent.'),
          error: (error: unknown) => {
            this.failed.set(true);
            this.feedback.set(
              error instanceof HttpErrorResponse
                ? `Send failed (${error.status || 'network error'}). You can retry.`
                : errorMessage(error),
            );
          },
        });
    } catch (error) {
      this.pending.set(false);
      this.failed.set(true);
      this.feedback.set(errorMessage(error));
    }
  }
}
