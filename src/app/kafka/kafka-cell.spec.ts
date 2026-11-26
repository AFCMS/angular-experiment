import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatInputHarness } from '@angular/material/input/testing';
import { Subject } from 'rxjs';
import { MyTopic } from './defs/MyTopic';
import { MyTopicConfig } from './MyTopicsConfig';
import { KafkaCell } from './kafka-cell';

describe('KafkaCell', () => {
  let fixture: ComponentFixture<KafkaCell<MyTopic>>;
  let loader: HarnessLoader;
  let http: HttpTestingController;
  const button = (text: string) => loader.getHarness(MatButtonHarness.with({ text }));
  const nullButton = () =>
    loader.getHarness(MatButtonHarness.with({ selector: '[aria-label="Note: toggle null"]' }));
  const idInput = () => loader.getHarness(MatInputHarness.with({ selector: 'input[name="id"]' }));
  const submit = async () => (await button('Send')).click();
  const text = () => (fixture.nativeElement as HTMLElement).textContent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KafkaCell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent<KafkaCell<MyTopic>>(KafkaCell);
    fixture.componentRef.setInput('definition', MyTopicConfig);
    await fixture.whenStable();
    loader = TestbedHarnessEnvironment.loader(fixture);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows only the title, preset buttons, editors, and actions', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('input')).toHaveLength(2);
    expect(element.querySelector('[name="status"]')).toBeNull();
    expect(element.querySelector('[name="timestamp"]')).toBeNull();
    expect(text()).not.toContain('/api/kafka/my-topic');
    expect(text()).not.toContain('Generated on every send');
    expect(element.querySelector('mat-error')).toBeNull();
  });

  it('posts validated edits without losing long precision and prevents duplicate sends', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    await (await idInput()).setValue('9223372036854775807');
    await submit();
    const request = http.expectOne('/api/kafka/my-topic');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    expect(request.request.body).toBe(
      '{"id":9223372036854775807,"status":"NEW","note":null,"timestamp":1234}',
    );
    expect(await (await button('Sending…')).isDisabled()).toBe(true);
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    http.expectNone('/api/kafka/my-topic');
    request.flush('accepted');
    await fixture.whenStable();
    expect(text()).toContain('Message sent.');
    expect(await (await button('Send')).isDisabled()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('details')).toBeNull();
  });

  it('sends fixed presets despite invalid edits and refreshes dynamic defaults for each send', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await (await idInput()).setValue('invalid');
    await (await nullButton()).click();
    const note = await loader.getHarness(MatInputHarness.with({ selector: 'input[name="note"]' }));
    await note.setValue('Edited note');
    await (await button('Send DONE')).click();
    const first = http.expectOne('/api/kafka/my-topic');
    expect(JSON.parse(first.request.body)).toEqual({
      id: 1,
      status: 'DONE',
      note: 'Processed successfully',
      timestamp: 1000,
    });
    first.flush('');
    await fixture.whenStable();
    clock.mockReturnValue(2000);
    await (await button('Send NEW')).click();
    const second = http.expectOne('/api/kafka/my-topic');
    expect(JSON.parse(second.request.body)).toEqual({
      id: 1,
      status: 'NEW',
      note: null,
      timestamp: 2000,
    });
    second.flush('');
    expect(await (await idInput()).getValue()).toBe('invalid');
    expect(await note.getValue()).toBe('Edited note');
  });

  it('blocks invalid edits, displays an error, and focuses the first invalid control', async () => {
    const id = await idInput();
    await id.setValue('1.5');
    await submit();
    http.expectNone('/api/kafka/my-topic');
    expect(text()).toContain('Enter a whole number.');
    expect(await id.isFocused()).toBe(true);
    await id.setValue('2');
    await submit();
    http.expectOne('/api/kafka/my-topic').flush('');
    await fixture.whenStable();
    expect(text()).toContain('Message sent.');
  });

  it('distinguishes an empty string from null and restores defaults on reset', async () => {
    await (await nullButton()).click();
    await submit();
    const empty = http.expectOne('/api/kafka/my-topic');
    expect(JSON.parse(empty.request.body).note).toBe('');
    empty.flush('');
    await fixture.whenStable();
    await (await nullButton()).click();
    await submit();
    const nullable = http.expectOne('/api/kafka/my-topic');
    expect(JSON.parse(nullable.request.body).note).toBeNull();
    nullable.flush('');
    await fixture.whenStable();
    await (await idInput()).setValue('9');
    await (await button('Reset')).click();
    expect(await (await idInput()).getValue()).toBe('1');
    expect(await (await (await nullButton()).host()).getAttribute('aria-pressed')).toBe('true');
  });

  it('uses the custom handler to populate Material autocomplete and sends the selected string', async () => {
    await (await nullButton()).click();
    const autocomplete = await loader.getHarness(
      MatAutocompleteHarness.with({ selector: 'input[name="note"]' }),
    );
    await autocomplete.enterText('Ready');
    await vi.waitFor(async () => expect(await autocomplete.getOptions()).toHaveLength(1));
    await autocomplete.selectOption({ text: 'Ready for processing' });
    await submit();
    const request = http.expectOne('/api/kafka/my-topic');
    expect(JSON.parse(request.request.body).note).toBe('Ready for processing');
    request.flush('');
  });

  it('cancels stale completion streams and recovers after a completion failure', async () => {
    const lookups = new Map<string, Subject<readonly string[]>>();
    const complete = vi.fn((query: string) => {
      const result = new Subject<readonly string[]>();
      lookups.set(query, result);
      return result;
    });
    fixture.componentRef.setInput('definition', {
      ...MyTopicConfig,
      initialValues: { ...MyTopicConfig.initialValues, note: '' },
      fields: MyTopicConfig.fields.map((field) =>
        field.key === 'note' ? { ...field, complete } : field,
      ),
    });
    await fixture.whenStable();
    const autocomplete = await loader.getHarness(
      MatAutocompleteHarness.with({ selector: 'input[name="note"]' }),
    );
    await autocomplete.enterText('old');
    await vi.waitFor(() => expect(lookups.has('old')).toBe(true));
    const old = lookups.get('old')!;
    expect(old.observed).toBe(true);
    await autocomplete.clear();
    await autocomplete.enterText('new');
    expect(old.observed).toBe(false);
    await vi.waitFor(() => expect(complete.mock.calls.map(([query]) => query)).toContain('new'));
    old.next(['Stale']);
    lookups.get('new')!.error(new Error('Unavailable'));
    await fixture.whenStable();
    expect(text()).toContain('Suggestions unavailable. You can still enter a value.');
    await autocomplete.clear();
    await autocomplete.enterText('retry');
    await vi.waitFor(() => expect(lookups.has('retry')).toBe(true));
    lookups.get('retry')!.next(['Recovered']);
    await fixture.whenStable();
    await vi.waitFor(async () => expect(await autocomplete.getOptions()).toHaveLength(1));
    await autocomplete.selectOption({ text: 'Recovered' });
    expect(text()).not.toContain('Suggestions unavailable.');
  });

  it('reports HTTP failures and permits retry', async () => {
    await submit();
    http
      .expectOne('/api/kafka/my-topic')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(text()).toContain('Send failed (503). You can retry.');
    await submit();
    http.expectOne('/api/kafka/my-topic').flush('');
    await fixture.whenStable();
    expect(text()).toContain('Message sent.');
  });

  it('keeps multiple instances independent', async () => {
    const firstId = await (await idInput()).getId();
    const other = TestBed.createComponent<KafkaCell<MyTopic>>(KafkaCell);
    other.componentRef.setInput('definition', MyTopicConfig);
    await other.whenStable();
    await (await idInput()).setValue('42');
    const otherLoader = TestbedHarnessEnvironment.loader(other);
    const otherId = await otherLoader.getHarness(
      MatInputHarness.with({ selector: 'input[name="id"]' }),
    );
    expect(await otherId.getValue()).toBe('1');
    expect(await otherId.getId()).not.toBe(firstId);
    other.destroy();
  });

  it('cancels outstanding HTTP requests on destroy', async () => {
    await submit();
    const request = http.expectOne('/api/kafka/my-topic');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
});
