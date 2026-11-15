import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { KafkaCell } from './kafka-cell';
import { MyTopicConfig } from './MyTopicsConfig';

@Component({
  selector: 'app-kafka-workspace',
  imports: [KafkaCell, MatTabsModule],
  templateUrl: './kafka-workspace.html',
  styleUrl: './kafka-workspace.scss',
})
export class KafkaWorkspace {
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
  ].map((label) => ({ label, cells: [MyTopicConfig] }));
}
