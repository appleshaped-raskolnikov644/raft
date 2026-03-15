import type { PRDetails, PRPanelData } from "./types"

export class PRCache {
  private details = new Map<string, PRDetails>()
  private panelData = new Map<string, PRPanelData>()

  getDetails(url: string): PRDetails | undefined {
    return this.details.get(url)
  }

  setDetails(url: string, data: PRDetails): void {
    this.details.set(url, data)
  }

  hasDetails(url: string): boolean {
    return this.details.has(url)
  }

  getPanelData(url: string): PRPanelData | undefined {
    return this.panelData.get(url)
  }

  setPanelData(url: string, data: PRPanelData): void {
    this.panelData.set(url, data)
  }

  hasPanelData(url: string): boolean {
    return this.panelData.has(url)
  }
}
