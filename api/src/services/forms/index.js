/**
 * Form Definition System — AI-First FormBuilder services.
 */

const { FormDefinitionService } = require('./form-definition.service');
const { FormSchemaBuilder, FIELD_TYPE_MAP } = require('./form-schema-builder');

module.exports = {
  FormDefinitionService,
  FormSchemaBuilder,
  FIELD_TYPE_MAP,
};
