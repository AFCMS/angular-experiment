import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatTabGroupHarness, MatTabHarness } from '@angular/material/tabs/testing';
import { KafkaWorkspace } from './kafka-workspace';

describe('KafkaWorkspace', () => {
  let fixture: ComponentFixture<KafkaWorkspace>;
  let loader: HarnessLoader;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KafkaWorkspace],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(KafkaWorkspace);
    await fixture.whenStable();
    loader = TestbedHarnessEnvironment.loader(fixture);
  });

  async function idInput(tab: MatTabHarness): Promise<MatInputHarness> {
    const panelId = await (await tab.host()).getAttribute('aria-controls');
    return loader.getHarness(
      MatInputHarness.with({ selector: `[id="${panelId}"] input[name="id"]` }),
    );
  }

  it('restores the ten original tabs and lazily renders their compact cells', async () => {
    const group = await loader.getHarness(MatTabGroupHarness);
    const tabs = await group.getTabs();
    expect(await Promise.all(tabs.map((tab) => tab.getLabel()))).toEqual([
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
    ]);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-kafka-cell')).toHaveLength(
      1,
    );
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[role="tablist"]')
        ?.getAttribute('aria-label'),
    ).toBe('Kafka workspaces');
    for (const tab of tabs) {
      await tab.select();
      expect(await tab.isSelected()).toBe(true);
      expect(await (await idInput(tab)).getValue()).toBe('1');
    }
  });

  it('preserves independent cell values when switching tabs', async () => {
    const group = await loader.getHarness(MatTabGroupHarness);
    const [first, second] = await group.getTabs();
    await (await idInput(first)).setValue('42');
    await second.select();
    expect(await (await idInput(second)).getValue()).toBe('1');
    await (await idInput(second)).setValue('99');
    await first.select();
    expect(await (await idInput(first)).getValue()).toBe('42');
    await second.select();
    expect(await (await idInput(second)).getValue()).toBe('99');
  });
});
