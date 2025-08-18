/**
 * Frontend Design Plugin
 *
 * Provides commands for analyzing and transforming frontend designs between projects.
 * Enhanced with advanced design pattern recognition and cross-project consistency checking.
 */
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const css = require('css');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class FrontendDesignPlugin {
  constructor(commandExecutor) {
    this.commandExecutor = commandExecutor;
    this.designPatterns = new Map();
    this.colorPalettes = new Map();
    this.designSystems = new Map();
  }

  getName() {
    return 'FrontendDesign';
  }

  getCommands() {
    return [
      {
        name: 'analyzeDesign',
        pattern: /^analyze-design\s+(.+)$/,
        description: 'Analyze frontend design patterns in a project',
        execute: this.analyzeDesign.bind(this)
      },
      {
        name: 'compareDesigns',
        pattern: /^compare-designs\s+(.+)\s+with\s+(.+)$/,
        description: 'Compare design patterns between two projects',
        execute: this.compareDesigns.bind(this)
      },
      {
        name: 'transformDesign',
        pattern: /^transform-design\s+(.+)\s+to\s+(.+)$/,
        description: 'Transform project A to match design patterns of project B',
        execute: this.transformDesign.bind(this)
      },
      {
        name: 'listDesignPatterns',
        pattern: /^list-design-patterns$/,
        description: 'List stored design patterns',
        execute: this.listDesignPatterns.bind(this)
      },
      {
        name: 'validateDesignSystem',
        pattern: /^validate-design-system\s+(.+)$/,
        description: 'Validate a project against a design system',
        execute: this.validateDesignSystem.bind(this)
      },
      {
        name: 'extractColorPalette',
        pattern: /^extract-color-palette\s+(.+)$/,
        description: 'Extract and analyze color palette from a project',
        execute: this.extractColorPalette.bind(this)
      }
    ];
  }

  async analyzeDesign(match) {
    const projectPath = match[1];
    try {
      const designData = await this.extractDesignPatterns(projectPath);
      this.designPatterns.set(projectPath, designData);
      return {
        success: true,
        output: `Analyzed design patterns for ${projectPath}`,
        data: designData
      };
    } catch (error) {
      return { success: false, output: `Design analysis failed: ${error.message}` };
    }
  }

  async extractDesignPatterns(projectPath) {
    const result = {
      components: {},
      styles: {},
      layout: {},
      colors: new Set()
    };

    // Analyze HTML files
    const htmlFiles = await this.findFiles(projectPath, '.html');
    for (const file of htmlFiles) {
      const content = await fs.readFile(file, 'utf8');
      const $ = cheerio.load(content);
      
      // Component analysis
      $('*').each((i, el) => {
        const tag = el.tagName.toLowerCase();
        const classes = $(el).attr('class')?.split(' ') || [];
        const id = $(el).attr('id');
        
        if (!result.components[tag]) {
          result.components[tag] = { count: 0, classes: {}, ids: {} };
        }
        
        result.components[tag].count++;
        classes.forEach(cls => {
          result.components[tag].classes[cls] = (result.components[tag].classes[cls] || 0) + 1;
        });
        
        if (id) {
          result.components[tag].ids[id] = (result.components[tag].ids[id] || 0) + 1;
        }
      });
      
      // Layout analysis
      const layoutStructure = this.analyzeLayout($);
      Object.assign(result.layout, layoutStructure);
    }

    // Analyze CSS files
    const cssFiles = await this.findFiles(projectPath, '.css');
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      const parsed = css.parse(content);
      
      parsed.stylesheet.rules.forEach(rule => {
        if (rule.type === 'rule') {
          rule.declarations.forEach(decl => {
            // Color extraction
            if (decl.property.match(/color|background|border/) && decl.value.match(/#[0-9a-f]{3,6}|rgb[a]?\(.+\)/i)) {
              result.colors.add(decl.value);
            }
            
            // Style pattern tracking
            const selector = rule.selectors.join(', ');
            if (!result.styles[selector]) {
              result.styles[selector] = {};
            }
            result.styles[selector][decl.property] = decl.value;
          });
        }
      });
    }

    return result;
  }

  async extractDesignPatterns(projectPath) {
    const result = {
      components: {},
      styles: {},
      layout: {},
      colors: new Set()
    };

    // Analyze HTML files
    const htmlFiles = await this.findFiles(projectPath, '.html');
    for (const file of htmlFiles) {
      const content = await fs.readFile(file, 'utf8');
      const $ = cheerio.load(content);
      
      // Component analysis
      $('*').each((i, el) => {
        const tag = el.tagName.toLowerCase();
        const classes = $(el).attr('class')?.split(' ') || [];
        const id = $(el).attr('id');
        
        if (!result.components[tag]) {
          result.components[tag] = { count: 0, classes: {}, ids: {} };
        }
        
        result.components[tag].count++;
        classes.forEach(cls => {
          result.components[tag].classes[cls] = (result.components[tag].classes[cls] || 0) + 1;
        });
        
        if (id) {
          result.components[tag].ids[id] = (result.components[tag].ids[id] || 0) + 1;
        }
      });
      
      // Layout analysis
      const layoutStructure = this.analyzeLayout($);
      Object.assign(result.layout, layoutStructure);
    }

    // Analyze CSS files
    const cssFiles = await this.findFiles(projectPath, '.css');
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      const parsed = css.parse(content);
      
      parsed.stylesheet.rules.forEach(rule => {
        if (rule.type === 'rule') {
          rule.declarations.forEach(decl => {
            // Color extraction
            if (decl.property.match(/color|background|border/) && decl.value.match(/#[0-9a-f]{3,6}|rgb[a]?\(.+\)/i)) {
              result.colors.add(decl.value);
            }
            
            // Style pattern tracking
            const selector = rule.selectors.join(', ');
            if (!result.styles[selector]) {
              result.styles[selector] = {};
            }
            result.styles[selector][decl.property] = decl.value;
          });
        }
      });
    }

    return result;
  }

  analyzeLayout($) {
    const layout = {
      gridAreas: new Set(),
      flexContainers: 0,
      commonStructures: {}
    };

    $('*').each((i, el) => {
      const display = $(el).css('display');
      if (display === 'grid') {
        const areas = $(el).css('grid-template-areas');
        if (areas) layout.gridAreas.add(areas);
      } else if (display === 'flex') {
        layout.flexContainers++;
      }
    });

    return layout;
  }

  async findFiles(dir, ext) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.findFiles(fullPath, ext));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  async compareDesigns(match) {
    const [projectA, projectB] = match.slice(1, 3);
    if (!this.designPatterns.has(projectA) || !this.designPatterns.has(projectB)) {
      return { 
        success: false, 
        output: `One or both projects not analyzed. Run analyze-design first.` 
      };
    }

    const designA = this.designPatterns.get(projectA);
    const designB = this.designPatterns.get(projectB);
    
    const comparison = {
      componentMatches: {},
      styleMatches: {},
      colorMatches: {},
      layoutMatches: {}
    };

    // Compare components
    for (const [tag, dataA] of Object.entries(designA.components)) {
      if (designB.components[tag]) {
        comparison.componentMatches[tag] = {
          countDiff: dataA.count - designB.components[tag].count,
          classMatches: this.compareMaps(dataA.classes, designB.components[tag].classes),
          idMatches: this.compareMaps(dataA.ids, designB.components[tag].ids)
        };
      }
    }

    // Compare styles
    for (const [selector, stylesA] of Object.entries(designA.styles)) {
      if (designB.styles[selector]) {
        comparison.styleMatches[selector] = this.compareMaps(stylesA, designB.styles[selector]);
      }
    }

    // Compare colors
    const colorMatches = [];
    const colorsA = Array.from(designA.colors);
    const colorsB = Array.from(designB.colors);
    
    for (const colorA of colorsA) {
      for (const colorB of colorsB) {
        if (this.colorsSimilar(colorA, colorB)) {
          colorMatches.push({ from: colorA, to: colorB });
          break;
        }
      }
    }
    comparison.colorMatches = colorMatches;

    return {
      success: true,
      output: `Comparison between ${projectA} and ${projectB}`,
      comparison
    };
  }

  compareMaps(mapA, mapB) {
    const result = { matches: 0, total: Object.keys(mapA).length };
    for (const key in mapA) {
      if (mapB[key]) result.matches++;
    }
    return result;
  }

  colorsSimilar(colorA, colorB, threshold = 0.1) {
    // Simple color comparison - could be enhanced with proper color diffing
    return colorA.replace(/\s+/g, '') === colorB.replace(/\s+/g, '');
  }

  async validateDesignSystem(match) {
    const projectPath = match[1];
    if (!this.designPatterns.has(projectPath)) {
      return {
        success: false,
        output: `Project not analyzed. Run analyze-design first.`
      };
    }

    const designData = this.designPatterns.get(projectPath);
    const issues = [];

    // Check for consistent naming patterns
    const componentNamingIssues = this.validateComponentNaming(designData.components);
    issues.push(...componentNamingIssues);

    // Check for design system violations
    const designSystemIssues = await this.checkDesignSystemViolations(projectPath, designData);
    issues.push(...designSystemIssues);

    if (issues.length > 0) {
      return {
        success: false,
        output: `Found ${issues.length} design system violations:\n${issues.join('\n')}`
      };
    }

    return {
      success: true,
      output: `Project ${projectPath} conforms to design system standards`
    };
  }

  validateComponentNaming(components) {
    const issues = [];
    const namingPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/; // kebab-case pattern
    
    for (const [tag, data] of Object.entries(components)) {
      // Check class naming consistency
      for (const cls in data.classes) {
        if (!namingPattern.test(cls)) {
          issues.push(`Invalid class naming: ${tag}.${cls} (should be kebab-case)`);
        }
      }
      
      // Check ID naming consistency
      for (const id in data.ids) {
        if (!namingPattern.test(id)) {
          issues.push(`Invalid ID naming: ${tag}#${id} (should be kebab-case)`);
        }
      }
    }
    
    return issues;
  }

  async checkDesignSystemViolations(projectPath, designData) {
    const issues = [];
    
    // Check for common CSS violations
    for (const [selector, styles] of Object.entries(designData.styles)) {
      // Check if using forbidden properties
      const forbiddenProps = ['position: absolute', 'float: left', 'float: right'];
      for (const [prop, value] of Object.entries(styles)) {
        const propValue = `${prop}: ${value}`;
        if (forbiddenProps.includes(propValue)) {
          issues.push(`Forbidden CSS property used: ${selector} { ${propValue} }`);
        }
      }
    }

    // Check JavaScript framework patterns (React, Vue, etc.)
    const jsFiles = await this.findFiles(projectPath, '.js');
    jsFiles.push(...await this.findFiles(projectPath, '.jsx'));
    jsFiles.push(...await this.findFiles(projectPath, '.ts'));
    jsFiles.push(...await this.findFiles(projectPath, '.tsx'));
    
    for (const file of jsFiles) {
      const content = await fs.readFile(file, 'utf8');
      // Check for inline styles in React components
      if (content.includes('style={')) {
        issues.push(`Inline styles found in ${file} (avoid inline styles in components)`);
      }
    }
    
    return issues;
  }

  async extractColorPalette(match) {
    const projectPath = match[1];
    try {
      const designData = await this.extractDesignPatterns(projectPath);
      const colorPalette = Array.from(designData.colors);
      
      // Analyze color relationships
      const colorAnalysis = this.analyzeColorRelationships(colorPalette);
      
      return {
        success: true,
        output: `Color palette extracted from ${projectPath}:\n${colorPalette.join('\n')}\n\nAnalysis:\n${JSON.stringify(colorAnalysis, null, 2)}`,
        palette: colorPalette,
        analysis: colorAnalysis
      };
    } catch (error) {
      return { success: false, output: `Color palette extraction failed: ${error.message}` };
    }
  }

  analyzeColorRelationships(colors) {
    // Simple analysis - could be enhanced with proper color theory algorithms
    const analysis = {
      primaryColors: [],
      secondaryColors: [],
      accentColors: [],
      monochromaticGroups: []
    };
    
    // Categorize colors based on simple heuristics
    colors.forEach(color => {
      // This is a simplified approach - in a real implementation, this would use color theory
      if (color.includes('#')) {
        const hex = color.replace('#', '');
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          
          // Simple classification based on RGB values
          if (r > 200 && g < 100 && b < 100) analysis.primaryColors.push(color);
          else if (g > 200 && r < 100 && b < 100) analysis.secondaryColors.push(color);
          else if (b > 200 && r < 100 && g < 100) analysis.accentColors.push(color);
        }
      }
    });
    
    return analysis;
  }

  async transformDesign(match) {
    const [projectA, projectB] = match.slice(1, 3);
    if (!this.designPatterns.has(projectA) || !this.designPatterns.has(projectB)) {
      return { 
        success: false, 
        output: `One or both projects not analyzed. Run analyze-design first.` 
      };
    }

    const comparison = await this.compareDesigns(match);
    if (!comparison.success) return comparison;

    // Generate transformation steps
    const transformations = this.generateTransformations(comparison.comparison);
    
    return {
      success: true,
      output: `Generated transformation steps from ${projectA} to ${projectB}`,
      transformations
    };
  }

  generateTransformations(comparison) {
    const steps = [];
    
    // Component transformations
    for (const [tag, matchData] of Object.entries(comparison.componentMatches)) {
      if (matchData.countDiff > 0) {
        steps.push(`Remove ${matchData.countDiff} ${tag} components`);
      } else if (matchData.countDiff < 0) {
        steps.push(`Add ${-matchData.countDiff} ${tag} components`);
      }
      
      // Class transformations
      for (const [cls, count] of Object.entries(matchData.classMatches)) {
        if (count === 0) {
          steps.push(`Update class usage for ${tag}.${cls}`);
        }
      }
    }
    
    // Style transformations
    for (const [selector, styleMatches] of Object.entries(comparison.styleMatches)) {
      if (styleMatches.matches < styleMatches.total) {
        steps.push(`Update styles for ${selector}`);
      }
    }
    
    // Color transformations
    for (const colorMatch of comparison.colorMatches) {
      steps.push(`Replace color ${colorMatch.from} with ${colorMatch.to}`);
    }
    
    return steps;
  }

  listDesignPatterns() {
    const projects = Array.from(this.designPatterns.keys());
    return {
      success: true,
      output: `${projects.length} projects analyzed`,
      projects
    };
  }
}

module.exports = FrontendDesignPlugin;