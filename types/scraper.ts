/**
 * TypeScript types for Scraper Management System
 */

export type ScraperVersionOrigin = 'AI_GENERATED' | 'MANUAL_EDIT' | 'ROLLBACK'

export interface ScraperVersion {
  id: string
  versionNumber: number
  description: string | null
  createdBy: string | null
  createdFrom: ScraperVersionOrigin
  agentSessionId: string | null
  lastTestedAt: string | null
  testResults: TestResults | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  codeHash: string
}

export interface ScraperVersionWithCode extends ScraperVersion {
  code: string
}

export interface FieldCoverage {
  field: string
  count: number
  percentage: number
  isRequired: boolean
}

export interface FieldsAnalysis {
  coverage: FieldCoverage[]
  completenessScore: number
  requiredFieldsCoverage: number
  optionalFieldsCoverage: number
}

export interface ScrapedEvent {
  title?: string | null
  startsAt?: string | null
  sourceUrl?: string | null
  description?: string | null
  coverCharge?: string | null
  imageUrl?: string | null
  doorsAt?: string | null
  endsAt?: string | null
  ticketUrl?: string | null
  genres?: string[] | null
  artists?: string[] | null
  ageRestriction?: string | null
}

export interface TestResults {
  success: boolean
  error?: string
  executionTime: number
  eventCount?: number
  events?: ScrapedEvent[]
  fieldsAnalysis?: FieldsAnalysis
  warnings?: string[]
}

export interface SourceInfo {
  id: string
  name: string
}

export interface ScraperListItem {
  id: string
  name: string
  website: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  isActive: boolean
  hasCode: boolean
  activeVersion: number | null
}

// API Response Types

export interface GetVersionsResponse {
  source: SourceInfo
  versions: ScraperVersion[]
  activeVersionNumber: number | null
  totalVersions: number
}

export type GetVersionCodeResponse = ScraperVersionWithCode

export interface CreateVersionResponse {
  success: boolean
  version: Omit<ScraperVersion, 'codeHash' | 'lastTestedAt' | 'testResults'>
  warnings?: string[]
}

export interface ActivateVersionResponse {
  success: boolean
  message: string
  version: {
    id: string
    versionNumber: number
    isActive: boolean
  }
}

export type TestScraperResponse = TestResults

export interface ListScrapersResponse {
  scrapers: ScraperListItem[]
}
