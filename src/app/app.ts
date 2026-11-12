import { Component } from '@angular/core';
import { AbstractControl, FormsModule, NgForm } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { CELL_DEFINITIONS, CellDefinition, FieldDefinition, FieldValue } from './playground-cells';

type CellState = Omit<CellDefinition, 'fields'> & {
  fields: (FieldDefinition & { value: FieldValue })[];
  feedback: string;
};

@Component({
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
  ],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly tabs = [
    'First',
    'Second',
    'Third',
    'Fourth',
    'Fifth',
    'Sixth',
    'Seventh',
    'Eighth',
    'Ninth',
    'Tenth',
  ].map((label, index) => ({
    id: `tab-${index + 1}`,
    label,
    cells: CELL_DEFINITIONS.map((definition): CellState => ({
      ...definition,
      fields: definition.fields.map((field) => ({
        ...field,
        value: structuredClone(field.initialValue),
      })),
      feedback: '',
    })),
  }));

  protected validateCell(cell: CellState, form: NgForm, element: HTMLFormElement): void {
    form.control.markAllAsTouched();
    if (form.invalid) {
      cell.feedback = 'Review the highlighted fields.';
      element
        .querySelector<HTMLElement>('input.ng-invalid, textarea.ng-invalid, mat-select.ng-invalid')
        ?.focus();
      return;
    }
    cell.feedback = 'All fields are valid.';
  }

  protected resetCell(cell: CellState, form: NgForm, clear = false): void {
    const values: Record<string, FieldValue> = {};
    for (const field of cell.fields) {
      field.value = clear
        ? Array.isArray(field.initialValue)
          ? []
          : typeof field.initialValue === 'boolean'
            ? false
            : null
        : structuredClone(field.initialValue);
      values[field.key] = field.value;
    }
    form.resetForm(values);
    cell.feedback = clear ? 'Fields cleared.' : 'Defaults restored.';
  }

  protected fieldError(control: AbstractControl | undefined, field: FieldDefinition): string {
    if (!control) return '';
    if (control.hasError('required')) return `${field.label} is required.`;
    if (control.hasError('email')) return 'Enter a valid email address.';
    if (control.hasError('min')) return `Minimum: ${field.min}.`;
    if (control.hasError('max')) return `Maximum: ${field.max}.`;
    if (control.hasError('pattern')) return 'Enter a URL starting with http:// or https://.';
    return 'Check this value.';
  }
}
