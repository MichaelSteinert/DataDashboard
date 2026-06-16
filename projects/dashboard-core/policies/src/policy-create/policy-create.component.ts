/*
 *  Copyright (c) 2025 Fraunhofer-Gesellschaft zur Förderung der angewandten Forschung e.V.
 *
 *  This program and the accompanying materials are made available under the
 *  terms of the Apache License, Version 2.0 which is available at
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 *  SPDX-License-Identifier: Apache-2.0
 *
 *  Contributors:
 *       Fraunhofer-Gesellschaft zur Förderung der angewandten Forschung e.V. - initial API and implementation
 *
 */

import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PolicyService } from '../policy.service';
import { AlertComponent } from '@eclipse-edc/dashboard-core';
import { PolicyType } from '@think-it-labs/edc-connector-client/dist/src/entities/policy/policy';
import {
  compact,
  EdcConnectorClientError,
  IdResponse,
  PolicyBuilder,
  PolicyDefinition,
  PolicyDefinitionInput,
  PolicyInput,
} from '@think-it-labs/edc-connector-client';

export interface UIConstraint {
  leftOperand: string;
  operator: string;
  rightOperand: string;
}

export interface UIRule {
  action: string;
  constraints: UIConstraint[];
}

@Component({
  selector: 'lib-policy-create',
  standalone: true,
  imports: [FormsModule, AlertComponent, NgClass],
  templateUrl: './policy-create.component.html',
  styleUrl: './policy-create.component.css',
})
export class PolicyCreateComponent implements OnChanges {
  private readonly policyService = inject(PolicyService);

  protected readonly Object = Object;

  @Input() policyDefinition?: PolicyDefinition;

  @Output() created = new EventEmitter<IdResponse>();
  @Output() updated = new EventEmitter<void>();
  mode: 'create' | 'update' = 'create';

  errorMsg = '';

  id = '';
  policyType?: PolicyType;

  // UI State
  uiMode: 'builder' | 'json' = 'builder';

  permissionsJson = '';
  prohibitionsJson = '';
  obligationsJson = '';

  permissions: UIRule[] = [];
  prohibitions: UIRule[] = [];
  obligations: UIRule[] = [];

  availableActions = ['use', 'odrl:distribute', 'odrl:delete'];
  availableLeftOperands = ['region', 'client_id', 'purpose', 'odrl:timeElapsed', 'odrl:distribute'];
  availableOperators = ['odrl:eq', 'odrl:neq', 'odrl:in'];

  async ngOnChanges() {
    if (this.policyDefinition) {
      const compactPolicy = await compact(this.policyDefinition.policy);
      this.mode = 'update';
      this.id = this.policyDefinition['@id'];

      const typeSplit: string[] = compactPolicy['@type'].split('/');
      this.policyType = typeSplit[typeSplit.length - 1] as PolicyType;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseRules = (rules: any[]): UIRule[] => {
        return rules.map(r => ({
          action: typeof r.action === 'string' ? r.action : r.action?.['@id'] || '',
          constraints: (r.constraint ? (Array.isArray(r.constraint) ? r.constraint : [r.constraint]) : [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((c: any) => ({
              leftOperand: typeof c.leftOperand === 'string' ? c.leftOperand : c.leftOperand?.['@id'] || '',
              operator: typeof c.operator === 'string' ? c.operator : c.operator?.['@id'] || 'odrl:eq',
              rightOperand:
                typeof c.rightOperand === 'string'
                  ? c.rightOperand
                  : c.rightOperand?.['@value'] || c.rightOperand || '',
            })),
        }));
      };

      if (this.policyDefinition.policy.permissions?.length > 0) {
        const compacted = await compact(this.policyDefinition.policy.permissions);
        this.permissionsJson = JSON.stringify(compacted, null, 2);
        this.permissions = parseRules(Array.isArray(compacted) ? compacted : [compacted]);
      }
      if (this.policyDefinition.policy.prohibitions?.length > 0) {
        const compacted = await compact(this.policyDefinition.policy.prohibitions);
        this.prohibitionsJson = JSON.stringify(compacted, null, 2);
        this.prohibitions = parseRules(Array.isArray(compacted) ? compacted : [compacted]);
      }
      if (this.policyDefinition.policy.obligations?.length > 0) {
        const compacted = await compact(this.policyDefinition.policy.obligations);
        this.obligationsJson = JSON.stringify(compacted, null, 2);
        this.obligations = parseRules(Array.isArray(compacted) ? compacted : [compacted]);
      }
    }
  }

  addRule(type: 'permissions' | 'prohibitions' | 'obligations') {
    this[type].push({ action: '', constraints: [] });
  }

  removeRule(type: 'permissions' | 'prohibitions' | 'obligations', index: number) {
    this[type].splice(index, 1);
  }

  addConstraint(rule: UIRule) {
    rule.constraints.push({ leftOperand: '', operator: 'odrl:eq', rightOperand: '' });
  }

  removeConstraint(rule: UIRule, index: number) {
    rule.constraints.splice(index, 1);
  }

  createPolicyDefinition(): void {
    try {
      const policyInput: PolicyDefinitionInput = this.createPolicyInput();
      this.policyService
        .createPolicyDefinition(policyInput)
        .then((idResponse: IdResponse) => {
          this.created.emit(idResponse);
        })
        .catch((err: EdcConnectorClientError) => {
          this.errorMsg = err.message;
        });
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.errorMsg = err.message; // Use the error message from the thrown error
      } else {
        this.errorMsg = 'An unknown error occurred.';
      }
    }
  }

  editPolicyDefinition(): void {
    try {
      const policyInput: PolicyDefinitionInput = this.createPolicyInput();
      this.policyService
        .updatePolicy(policyInput.id!, policyInput)
        .then(() => this.updated.emit())
        .catch((err: EdcConnectorClientError) => {
          this.errorMsg = err.message;
        });
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.errorMsg = err.message; // Use the error message from the thrown error
      } else {
        this.errorMsg = 'An unknown error occurred.';
      }
    }
  }

  private createPolicyInput(): PolicyDefinitionInput {
    const policyInput: PolicyInput = {
      '@type': this.policyType,
    };

    if (this.uiMode === 'builder') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapConstraints = (constraints: UIConstraint[]): any => {
        if (constraints.length === 0) return undefined;
        if (constraints.length === 1) {
          return {
            leftOperand: constraints[0].leftOperand,
            operator: constraints[0].operator,
            rightOperand: constraints[0].rightOperand,
          };
        }
        // Multiple constraints: wrap in an odrl:and MultiplicityConstraint
        return {
          '@type': 'odrl:and',
          constraint: constraints.map(c => ({
            leftOperand: c.leftOperand,
            operator: c.operator,
            rightOperand: c.rightOperand,
          })),
        };
      };

      const mapRules = (rules: UIRule[]) =>
        rules.map(r => ({
          action: r.action,
          constraint: mapConstraints(r.constraints),
        }));

      if (this.permissions.length > 0) policyInput.permission = mapRules(this.permissions);
      if (this.prohibitions.length > 0) policyInput.prohibition = mapRules(this.prohibitions);
      if (this.obligations.length > 0) policyInput.obligation = mapRules(this.obligations);
    } else {
      // Individual JSON parsing with separate error handling
      try {
        if (this.permissionsJson && this.permissionsJson !== '') {
          policyInput.permission = JSON.parse(this.permissionsJson);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          throw new Error(`Invalid JSON for permissions: ${err.message}`, { cause: err });
        } else {
          throw new Error('An unknown error occurred during permissions JSON parsing.', { cause: err });
        }
      }

      try {
        if (this.prohibitionsJson && this.prohibitionsJson !== '') {
          policyInput.prohibition = JSON.parse(this.prohibitionsJson);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          throw new Error(`Invalid JSON for prohibitions: ${err.message}`, { cause: err });
        } else {
          throw new Error('An unknown error occurred during prohibitions JSON parsing.', { cause: err });
        }
      }

      try {
        if (this.obligationsJson && this.obligationsJson !== '') {
          policyInput.obligation = JSON.parse(this.obligationsJson);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          throw new Error(`Invalid JSON for obligations: ${err.message}`, { cause: err });
        } else {
          throw new Error('An unknown error occurred during obligations JSON parsing.', { cause: err });
        }
      }
    }

    let policy;
    if (this.policyType) {
      policy = new PolicyBuilder().type(this.policyType).raw(policyInput).build();
    } else {
      policy = new PolicyBuilder()
        .type('Set' as PolicyType)
        .raw(policyInput)
        .build();
    }

    const policyDefinitionInput: PolicyDefinitionInput = {
      policy: policy,
    };

    if (this.id) {
      policyDefinitionInput.id = this.id;
      policyDefinitionInput['@id'] = this.id;
    }

    return policyDefinitionInput;
  }
}
