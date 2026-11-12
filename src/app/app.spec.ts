import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatTabGroupHarness } from '@angular/material/tabs/testing';
import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let loader: HarnessLoader;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }).compileComponents();
    fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    loader = TestbedHarnessEnvironment.loader(fixture);
  });

  it('should create the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders ten tabs with twelve grouped forms in each tab', async () => {
    const tabs = await loader.getHarness(MatTabGroupHarness);
    expect(await tabs.getTabs()).toHaveLength(10);
    for (const tab of await tabs.getTabs()) {
      await tab.select();
      const label = await tab.getLabel();
      const panelId = await (await tab.host()).getAttribute('aria-controls');
      const panel = (fixture.nativeElement as HTMLElement).querySelector('[id="' + panelId + '"]')!;
      const selected = await tabs.getSelectedTab();
      expect(await selected.getLabel()).toBe(label);
      expect(panel.querySelectorAll('form')).toHaveLength(12);
    }
  });

  it('validates emails and focuses the invalid field before accepting the form', async () => {
    const email = await loader.getHarness(
      MatInputHarness.with({ selector: '#tab-1-profile-email' }),
    );
    const validate = await loader.getHarness(
      MatButtonHarness.with({
        selector: 'form[aria-labelledby="tab-1-profile-heading"] button[type="submit"]',
      }),
    );
    await email.setValue('invalid-email');
    await validate.click();
    const compiled = fixture.nativeElement as HTMLElement;
    const profile = compiled.querySelector('form[aria-labelledby="tab-1-profile-heading"]')!;
    expect(profile.querySelector('mat-error')?.textContent).toContain(
      'Enter a valid email address.',
    );
    expect(await email.isFocused()).toBe(true);
    await email.setValue('valid@example.com');
    await validate.click();
    expect(profile.querySelector('[role="status"]')?.textContent).toContain(
      'All fields are valid.',
    );
  });

  it('enforces numeric limits and restores defaults on reset', async () => {
    const members = await loader.getHarness(
      MatInputHarness.with({ selector: '#tab-1-limits-members' }),
    );
    const validate = await loader.getHarness(
      MatButtonHarness.with({
        selector: 'form[aria-labelledby="tab-1-limits-heading"] button[type="submit"]',
      }),
    );
    await members.setValue('101');
    await validate.click();
    const limits = (fixture.nativeElement as HTMLElement).querySelector(
      'form[aria-labelledby="tab-1-limits-heading"]',
    )!;
    expect(limits.querySelector('mat-error')?.textContent).toContain('Maximum: 100.');
    const reset = await loader.getHarness(
      MatButtonHarness.with({
        selector: 'form[aria-labelledby="tab-1-limits-heading"] button',
        text: 'Reset',
      }),
    );
    await reset.click();
    expect(await members.getValue()).toBe('12');
    await validate.click();
    expect(limits.querySelector('[role="status"]')?.textContent).toContain('All fields are valid.');
  });

  it('preserves independent values across lazy tab content', async () => {
    const tabs = await loader.getHarness(MatTabGroupHarness);
    const firstName = await loader.getHarness(
      MatInputHarness.with({ selector: '#tab-1-profile-name' }),
    );
    await firstName.setValue('First tab only');
    await tabs.selectTab({ label: 'Second' });
    const secondName = await loader.getHarness(
      MatInputHarness.with({ selector: '#tab-2-profile-name' }),
    );
    expect(await secondName.getValue()).toBe('Alex Morgan');
    await secondName.setValue('Second tab only');
    await tabs.selectTab({ label: 'First' });
    const restoredName = await loader.getHarness(
      MatInputHarness.with({ selector: '#tab-1-profile-name' }),
    );
    expect(await restoredName.getValue()).toBe('First tab only');
  });
});
