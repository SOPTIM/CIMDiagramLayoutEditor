import { SparqlService } from './SparqlService';
import { DiagramQueryBuilder } from '@/queries/DiagramQueryBuilder';
import { PointQueryBuilder } from '@/queries/PointQueryBuilder';
import { ObjectQueryBuilder } from '@/queries/ObjectQueryBuilder';
import { TooltipQueryBuilder } from '@/queries/TooltipQueryBuilder';

import { DiagramService } from '@/features/diagram/DiagramService';
import { PointService } from '@/features/points/PointService';
import { ObjectService } from '@/features/objects/ObjectService';
import { TooltipService } from '@/features/tooltips/TooltipService';
import { AppConfig } from '@/core/config/AppConfig';
import { GluePointQueryBuilder } from '@/queries/GluePointQueryBuilder';
import { GluePointService } from '@/features/gluepoints/GluePointService';

/**
 * Registry for application services
 * 
 * This provides a simple dependency injection pattern
 */
class ServiceRegistry {
  // SPARQL and Query Builders
  private readonly sparqlService = new SparqlService(AppConfig.defaultEndpoint);
  private readonly diagramQueryBuilder = new DiagramQueryBuilder();
  private readonly pointQueryBuilder = new PointQueryBuilder();
  private readonly objectQueryBuilder = new ObjectQueryBuilder();
  private readonly tooltipQueryBuilder = new TooltipQueryBuilder();
  private readonly gluePointQueryBuilder = new GluePointQueryBuilder();
  
  // Feature Services
  private readonly _diagramService: DiagramService;
  private readonly _pointService: PointService;
  private readonly _objectService: ObjectService;
  private readonly _tooltipService: TooltipService;
  private readonly _gluePointService: GluePointService;
  
  constructor() {
    // Initialize services with dependencies
    this._diagramService = new DiagramService(
      this.sparqlService,
      this.diagramQueryBuilder
    );
    
    this._pointService = new PointService(
      this.sparqlService,
      this.pointQueryBuilder,
      this.objectQueryBuilder,
      this.diagramService
    );
    
    this._objectService = new ObjectService(
      this.sparqlService,
      this.diagramService,
      this.objectQueryBuilder,
      this.pointQueryBuilder
    );
    
    this._tooltipService = new TooltipService(
      this.sparqlService,
      this.tooltipQueryBuilder
    );

    this._gluePointService = new GluePointService(
      this.sparqlService,
      this.gluePointQueryBuilder,
      this.diagramService
    );
  }
  
  // Expose services as getters
  get diagramService(): DiagramService {
    return this._diagramService;
  }
  
  get pointService(): PointService {
    return this._pointService;
  }
  
  get objectService(): ObjectService {
    return this._objectService;
  }
  
  get tooltipService(): TooltipService {
    return this._tooltipService;
  }

  get gluePointService(): GluePointService {
    return this._gluePointService;
  }
}

// Create and export a singleton instance
export const serviceRegistry = new ServiceRegistry();