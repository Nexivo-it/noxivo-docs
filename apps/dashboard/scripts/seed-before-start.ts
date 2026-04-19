import 'dotenv/config';
import process from 'process';
import { ensurePlatformSeeds } from '@noxivo/database/seed-utils';

await ensurePlatformSeeds();