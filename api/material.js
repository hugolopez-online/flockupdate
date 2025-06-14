let flock;

export function setFlockReference(ref) {
  flock = ref;
}

export const flockMaterial = {
  randomColour() {
    const letters = "0123456789ABCDEF";
    let colour = "#";
    for (let i = 0; i < 6; i++) {
      colour += letters[Math.floor(Math.random() * 16)];
    }
    return colour;
  },
  rgbToHex(rgb) {
    const result = rgb.match(/\d+/g).map(function (x) {
      const hex = parseInt(x).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    });
    return "#" + result.join("");
  },
  hexToRgba(hex, alpha) {
    hex = hex.replace(/^#/, "");
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },
  getColorFromString(colourString) {
    if (/^#([0-9A-F]{3}){1,2}$/i.test(colourString)) {
      return colourString;
    }

    try {
      const colorDiv = flock.document.createElement("div");
      colorDiv.style.color = colourString;
      flock.document.body.appendChild(colorDiv);
      const computedColor = getComputedStyle(colorDiv).color;

      flock.document.body.removeChild(colorDiv);
      return flock.rgbToHex(computedColor);
    } catch (e) {
      return "#000000";
    }
  },

  tint(meshName, { color } = {}) {
    return flock.whenModelReady(meshName, (mesh) => {
      if (mesh.material) {
        mesh.renderOverlay = true;
        mesh.overlayAlpha = 0.5;
        mesh.overlayColor = flock.BABYLON.Color3.FromHexString(
          flock.getColorFromString(color),
        );
      }

      mesh.getChildMeshes().forEach(function (childMesh) {
        if (childMesh.material) {
          childMesh.renderOverlay = true;
          childMesh.overlayAlpha = 0.5;
          childMesh.overlayColor = flock.BABYLON.Color3.FromHexString(
            flock.getColorFromString(
              flock.getColorFromString(color),
            ),
          );
        }
      });
    });
  },
  highlight(meshName,  { color } = {}) {
    const applyHighlight = (mesh) => {
      if (mesh.material) {
        flock.highlighter.addMesh(
          mesh,
          flock.BABYLON.Color3.FromHexString(
            flock.getColorFromString(color),
          ),
        );
      }
    };

    return flock.whenModelReady(meshName, (mesh) => {
      applyHighlight(mesh);
      mesh.getChildMeshes().forEach(applyHighlight);
    });
  },
  glow(meshName, { color } = {}) {
    // Ensure the glow layer is initialised
    if (!flock.glowLayer) {
      flock.glowLayer = new flock.BABYLON.GlowLayer(
        "glowLayer",
        flock.scene,
      );
      flock.glowLayer.intensity = 0.5;
    }

    return flock.whenModelReady(meshName, (mesh) => {
      flock.glowMesh(mesh, color);
    });
  },
  glowMesh(mesh, glowColor = null) {
    const applyGlow = (m) => {
      m.metadata = m.metadata || {};
      m.metadata.glow = true;

      if (m.material) {
        const emissiveColor = glowColor
          ? flock.BABYLON.Color3.FromHexString(
              flock.getColorFromString(glowColor)
            )
          : m.material.diffuseColor || m.material.albedoColor || flock.BABYLON.Color3.Black();

        m.material.emissiveColor = emissiveColor;
        m.material.emissiveIntensity = 1.0;
      }
    };

    applyGlow(mesh);
    mesh.getChildMeshes().forEach(applyGlow);
  },
  setAlpha(meshName, { value = 1 } = {}) {
    // Clamp value between 0 and 1
    value = Math.max(0, Math.min(1, value));

    return flock.whenModelReady(meshName, (mesh) => {
      const allMeshes = [mesh, ...mesh.getDescendants()];

      allMeshes.forEach((nextMesh) => {
        if (nextMesh.material) {
          flock.ensureUniqueMaterial(nextMesh);
          nextMesh.material.alpha = value;
          nextMesh.material.transparencyMode =
            flock.BABYLON.Material.MATERIAL_ALPHABLEND;
        }
      });
    });
  },
  clearEffects(meshName) {
    return flock.whenModelReady(meshName, (mesh) => {
      const removeEffects = (targetMesh) => {
        if (targetMesh.material) {
          // Reset emissive color to black
          targetMesh.material.emissiveColor =
            flock.BABYLON.Color3.Black();
        }

        // Remove mesh from glow layer
        if (flock.glowLayer) {
          mesh.metadata.glow = false;
          flock.glowLayer.removeIncludedOnlyMesh(targetMesh);
        }

        flock.highlighter.removeMesh(targetMesh);
        // Disable any render overlay
        targetMesh.renderOverlay = false;
      };

      // Apply to the main mesh
      removeEffects(mesh);

      // Apply to child meshes
      mesh.getChildMeshes().forEach(removeEffects);
    });
  },
  ensureUniqueMaterial(mesh) {
    // Helper function to clone material for a mesh
    const cloneMaterial = (originalMaterial) => {
      return originalMaterial.clone(`${originalMaterial.name}`);
    };

    // Recursive function to collect all meshes in the hierarchy
    const collectMeshes = (node, meshes = []) => {
      if (node instanceof flock.BABYLON.Mesh) {
        meshes.push(node);
      }
      if (node.getChildren) {
        node.getChildren().forEach((child) =>
          collectMeshes(child, meshes),
        );
      }
      return meshes;
    };

    // Collect all meshes in the hierarchy (root + descendants)
    const allMeshes = collectMeshes(mesh);

    // Create a mapping of original materials to their clones
    const materialMapping = new Map();

    // Iterate through all collected meshes
    allMeshes.forEach((currentMesh) => {
      if (currentMesh.material && currentMesh.metadata?.sharedMaterial) {
        // Check if the material has already been cloned
        if (!materialMapping.has(currentMesh.material)) {
          // Clone the material and store it in the mapping
          const clonedMaterial = cloneMaterial(currentMesh.material);
          materialMapping.set(currentMesh.material, clonedMaterial);
        }

        // Assign the cloned material to the current mesh
        currentMesh.material = materialMapping.get(
          currentMesh.material,
        );
        currentMesh.metadata.sharedMaterial = false; // Material is now unique to this hierarchy
      }
    });
  },
  ensureStandardMaterial(mesh) {
    if (!mesh) return;

    // Set to track replaced materials and their corresponding replacements
    const replacedMaterialsMap = new Map();

    // Default material to use as the replacement base
    const defaultMaterial =
      flock.scene.defaultMaterial ||
      new flock.BABYLON.StandardMaterial("defaultMaterial", flock.scene);
    defaultMaterial.backFaceCulling = false;

    const replaceIfPBRMaterial = (targetMesh) => {
      const material = targetMesh.material;

      if (material && material.getClassName() === "PBRMaterial") {
        if (!replacedMaterialsMap.has(material)) {
          // Replace with a cloned default material, preserving the name
          const originalName = material.name;
          const newMaterial = defaultMaterial.clone(originalName);
          replacedMaterialsMap.set(material, newMaterial);
        }

        // Assign the replaced material to the mesh
        targetMesh.material = replacedMaterialsMap.get(material);
        targetMesh.backFaceCulling = false;
      }
    };

    // Replace material on the main mesh
    replaceIfPBRMaterial(mesh);

    // Replace materials on all child meshes
    mesh.getChildMeshes().forEach(replaceIfPBRMaterial);

    // Dispose of all replaced materials
    replacedMaterialsMap.forEach((newMaterial, oldMaterial) => {
      oldMaterial.dispose();
    });
  },
  changeColor(meshName, { color } = {}) {
    return flock.whenModelReady(meshName, (mesh) => {
      if (!mesh) {
        flock.scene.clearColor = flock.BABYLON.Color3.FromHexString(
          flock.getColorFromString(color)
        );
        return Promise.resolve(); // or just let it resolve naturally
      }

      return flock.changeColorMesh(mesh, color);
    });
  },
  changeColorMesh(mesh, color) {
    if (!mesh) {
      flock.scene.clearColor = flock.BABYLON.Color3.FromHexString(
        flock.getColorFromString(color),
      );
      return;
    }

    if (mesh.metadata?.sharedMaterial) flock.ensureUniqueMaterial(mesh);

    // Ensure color is an array
    const colors = Array.isArray(color) ? color : [color];
    let colorIndex = 0;

    // Map to keep track of materials and their assigned colours and indices
    const materialToColorMap = new Map();

    function applyColorInOrder(part) {
      if (part.material) {
        // Check if the material is already processed
        if (!materialToColorMap.has(part.material)) {
          const currentIndex = colorIndex % colors.length;

          const hexColor = flock.getColorFromString(
            colors[currentIndex],
          );
          const babylonColor =
            flock.BABYLON.Color3.FromHexString(hexColor);

          // Apply the colour to the material
          if (part.material.diffuseColor !== undefined) {
            part.material.diffuseColor = babylonColor;
          } else {
            part.material.albedoColor =
              babylonColor.toLinearSpace();
            part.material.emissiveColor =
              babylonColor.toLinearSpace();
            part.material.emissiveIntensity = 0.1;
          }

          // Map the material to the colour and its assigned index
          materialToColorMap.set(part.material, {
            hexColor,
            index: currentIndex,
          });

          // Set metadata on this mesh with its colour index
          if (!part.metadata) {
            part.metadata = {};
          }
          if (!part.metadata.materialIndex) {
            part.metadata.materialIndex = colorIndex;
          }

          colorIndex++;
        } else {
          // Material already processed, reapply the existing index
          if (!part.metadata) {
            part.metadata = {};
          }

          if (part.metadata.materialIndex === undefined) {
            part.metadata.materialIndex = colorIndex;
          }
        }
      }

      // Process the submeshes (children) of the current mesh, sorted alphabetically
      const sortedChildMeshes = part
        .getChildMeshes()
        .sort((a, b) => a.name.localeCompare(b.name));
      sortedChildMeshes.forEach((child) => applyColorInOrder(child));
    }

    // Start applying colours to the main mesh and its hierarchy

    if (!flock.characterNames.includes(mesh.metadata?.meshName)) {
      applyColorInOrder(mesh);
    } else {
      const characterColors = {
        hair: colors[0],
        skin: colors[1],
        eyes: colors[2],
        tshirt: colors[3],
        shorts: colors[4],
        sleeves: colors[5],
      };
      flock.applyColorsToCharacter(mesh, characterColors);
      return;
    }

    // If no material was found, create a new one and set metadata
    if (materialToColorMap.size === 0) {
      const material = new flock.BABYLON.StandardMaterial(
        "meshMaterial",
        flock.scene,
      );
      material.diffuseColor = flock.BABYLON.Color3.FromHexString(
        colors[0],
      );
      material.backFaceCulling = false;
      mesh.material = material;
      if (!mesh.metadata) {
        mesh.metadata = {};
      }
      mesh.metadata.materialIndex = 0;
    }

    try {
      if (mesh.metadata.shapeType === "Cylinder") {
        mesh.forceSharedVertices();
        mesh.convertToFlatShadedMesh();
      }
    } catch (e) {
      console.log("Error converting mesh to flat shaded:", e);
    }

    if (mesh.metadata?.glow) {
      flock.glowMesh(mesh);
    }
  },
  applyColorToMaterial(part, materialName, color) {
    if (part.material && part.material.name === materialName) {
      part.material.diffuseColor = flock.BABYLON.Color3.FromHexString(
        flock.getColorFromString(color),
      );
      part.material.albedoColor = flock.BABYLON.Color3.FromHexString(
        flock.getColorFromString(color),
      );
    }
    part.getChildMeshes().forEach((child) => {
      flock.applyColorToMaterial(child, materialName, color);
    });
  },
  applyColorsToCharacter(mesh, colors) {
    const {
      hair: hairColor,
      skin: skinColor,
      eyes: eyesColor,
      sleeves: sleevesColor,
      shorts: shortsColor,
      tshirt: tshirtColor,
    } = colors;

    flock.applyColorToMaterial(mesh, "Hair", hairColor);
    flock.applyColorToMaterial(mesh, "Skin", skinColor);
    flock.applyColorToMaterial(mesh, "Eyes", eyesColor);
    flock.applyColorToMaterial(mesh, "Detail", sleevesColor);
    flock.applyColorToMaterial(mesh, "Shorts", shortsColor);
    flock.applyColorToMaterial(mesh, "TShirt", tshirtColor);
    flock.applyColorToMaterial(mesh, "Tshirt", tshirtColor);
    flock.applyColorToMaterial(mesh, "Sleeves", sleevesColor);
    flock.applyColorToMaterial(mesh, "Shoes", sleevesColor);
  },
  changeMaterial(meshName, materialName, color) {
    return flock.whenModelReady(meshName, (mesh) => {
      const texturePath = flock.texturePath + materialName;
      flock.changeMaterialMesh(mesh, materialName, texturePath, color);
    });
  },
  changeMaterialMesh(mesh, materialName, texturePath, color, alpha = 1) {
    flock.ensureUniqueMaterial(mesh);

    // Create a new material
    const material = new flock.BABYLON.StandardMaterial(
      materialName,
      flock.scene,
    );

    // Load the texture if provided
    if (texturePath) {
      const texture = new flock.BABYLON.Texture(texturePath, flock.scene);
      material.diffuseTexture = texture;
    }

    // Set colour if provided
    if (color) {
      const hexColor = flock.getColorFromString(color);
      const babylonColor = flock.BABYLON.Color3.FromHexString(hexColor);
      material.diffuseColor = babylonColor;
    }

    material.alpha = alpha;
    material.backFaceCulling = false;

    // Assign the material to the mesh and its descendants
    const allMeshes = [mesh].concat(mesh.getDescendants());
    allMeshes.forEach((part) => {
      part.material = material;
    });

    if (mesh.metadata?.glow) {
      flock.glowMesh(mesh);
    }

    return material;
  },
  setMaterial(meshName, materials) {
    return flock.whenModelReady(meshName, (mesh) => {
      const allMeshes = [mesh].concat(mesh.getDescendants());
      const validMeshes = allMeshes.filter(
        (part) => part instanceof flock.BABYLON.Mesh,
      );

      // Sort meshes alphabetically by name
      const sortedMeshes = validMeshes.sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      sortedMeshes.forEach((part, index) => {
        const material = Array.isArray(materials)
          ? materials[index % materials.length]
          : materials;

        if (material instanceof flock.GradientMaterial) {
          mesh.computeWorldMatrix(true);

          const boundingInfo = mesh.getBoundingInfo();

          const yDimension =
            boundingInfo.boundingBox.extendSizeWorld.y;

          material.scale = yDimension > 0 ? 1 / yDimension : 1;
        }
        if (!(material instanceof flock.BABYLON.Material)) {
          console.error(
            `Invalid material provided for mesh ${part.name}:`,
            material,
          );
          return;
        }

        // Apply the material to the mesh
        part.material = material;
      });

      if (mesh.metadata?.glow) {
        flock.glowMesh(mesh);
      }
    });
  },
    createMaterial({ color, materialName, alpha } = {}) {
    let material;

    const texturePath = flock.texturePath + materialName;

    // Handle gradient color case
    if (Array.isArray(color) && color.length === 2) {
      material = new flock.GradientMaterial(materialName, flock.scene);

      material.bottomColor = flock.BABYLON.Color3.FromHexString(
        flock.getColorFromString(color[0]),
      );
      material.topColor = flock.BABYLON.Color3.FromHexString(
        flock.getColorFromString(color[1]),
      );
      material.offset = 0.5;
      material.smoothness = 0.5;
      material.scale = 1.0;
      material.backFaceCulling = false;
    } else {
      // Default to StandardMaterial
      material = new flock.BABYLON.StandardMaterial(
        materialName,
        flock.scene,
      );

      // Load texture if provided
      if (texturePath) {
        const texture = new flock.BABYLON.Texture(
          texturePath,
          flock.scene,
        );
        material.diffuseTexture = texture;
      }

      // Set single color if provided
      if (color) {
        const hexColor = flock.getColorFromString(color);
        const babylonColor =
          flock.BABYLON.Color3.FromHexString(hexColor);
        material.diffuseColor = babylonColor;
      }

      material.backFaceCulling = false;
    }

    material.alpha = alpha;

    return material;
  },
  applyMaterialToMesh(mesh, shapeType, color, alpha = 1.0) {
    const scene = mesh.getScene();

    const makeColor4 = (c) => {
      if (typeof c === "string") {
        const col = flock.BABYLON.Color3.FromHexString(c);
        return new flock.BABYLON.Color4(col.r, col.g, col.b, alpha);
      } else if (c instanceof flock.BABYLON.Color3) {
        return new flock.BABYLON.Color4(c.r, c.g, c.b, alpha);
      } else if (c instanceof flock.BABYLON.Color4) {
        return new flock.BABYLON.Color4(c.r, c.g, c.b, alpha);
      } else {
        return new flock.BABYLON.Color4(1, 1, 1, alpha); // default to white
      }
    };

    if (!Array.isArray(color) || color.length === 1) {
      const material = new flock.BABYLON.StandardMaterial(
        `${shapeType.toLowerCase()}Material`,
        mesh.getScene(),
      );
      material.diffuseColor = flock.BABYLON.Color3.FromHexString(
        flock.getColorFromString(color),
      );
      material.alpha = alpha;
      mesh.material = material;
      return;
    }

    if (shapeType === "Box") {
      const positions = mesh.getVerticesData(
        flock.BABYLON.VertexBuffer.PositionKind,
      );
      const indices = mesh.getIndices();
      const normals = mesh.getVerticesData(
       flock.BABYLON.VertexBuffer.NormalKind,
      );

      if (!positions || !indices || indices.length !== 36) {
        console.warn(
          "Mesh is not a standard box; falling back to uniform color.",
        );
        return this.applyMaterialToMesh(
          mesh,
          shapeType,
          color[0],
          alpha,
        );
      }

      // Face order: front, back, right, left, top, bottom
      const faceToSide = [
        "front", // face 0
        "back", // face 1
        "right", // face 2
        "left", // face 3
        "top", // face 4
        "bottom", // face 5
      ];

      const sideColorMap = {
        front: makeColor4(color[0]),
        back: makeColor4(color[0]),
        left: makeColor4(color[0]),
        right: makeColor4(color[0]),
        top: makeColor4(color[0]),
        bottom: makeColor4(color[0]),
      };

      switch (color.length) {
        case 2:
          sideColorMap.top = sideColorMap.bottom = makeColor4(
            color[0],
          );
          sideColorMap.left =
            sideColorMap.right =
            sideColorMap.front =
            sideColorMap.back =
              makeColor4(color[1]);
          break;
        case 3:
          sideColorMap.top = sideColorMap.bottom = makeColor4(
            color[0],
          );
          sideColorMap.left = sideColorMap.right = makeColor4(
            color[1],
          );
          sideColorMap.front = sideColorMap.back = makeColor4(
            color[2],
          );
          break;
        case 4:
          sideColorMap.top = makeColor4(color[0]);
          sideColorMap.bottom = makeColor4(color[1]);
          sideColorMap.left = sideColorMap.right = makeColor4(
            color[2],
          );
          sideColorMap.front = sideColorMap.back = makeColor4(
            color[3],
          );
          break;
        case 5:
          sideColorMap.top = sideColorMap.bottom = makeColor4(
            color[0],
          );
          sideColorMap.left = makeColor4(color[1]);
          sideColorMap.right = makeColor4(color[2]);
          sideColorMap.front = makeColor4(color[3]);
          sideColorMap.back = makeColor4(color[4]);
          break;
        case 6:
        default:
          [
            sideColorMap.top,
            sideColorMap.bottom,
            sideColorMap.left,
            sideColorMap.right,
            sideColorMap.front,
            sideColorMap.back,
          ] = color.slice(0, 6).map(makeColor4);
          break;
      }

      const colors = [];
      const newPositions = [];
      const newNormals = [];
      const newIndices = [];

      let baseIndex = 0;

      for (let i = 0; i < indices.length; i += 6) {
        const faceIndex = i / 6;
        const side = faceToSide[faceIndex];
        const faceColor = sideColorMap[side];

        for (let j = 0; j < 6; j++) {
          const vi = indices[i + j];

          newPositions.push(
            positions[vi * 3],
            positions[vi * 3 + 1],
            positions[vi * 3 + 2],
          );

          if (normals) {
            newNormals.push(
              normals[vi * 3],
              normals[vi * 3 + 1],
              normals[vi * 3 + 2],
            );
          }

          colors.push(
            faceColor.r,
            faceColor.g,
            faceColor.b,
            faceColor.a,
          );
          newIndices.push(baseIndex++);
        }
      }

      mesh.setVerticesData(
        flock.BABYLON.VertexBuffer.PositionKind,
        newPositions,
      );
      mesh.setVerticesData(flock.BABYLON.VertexBuffer.NormalKind, newNormals);
      mesh.setVerticesData(flock.BABYLON.VertexBuffer.ColorKind, colors);
      mesh.setIndices(newIndices);

      mesh.hasVertexAlpha = true;

      const mat = new flock.BABYLON.StandardMaterial("faceColorMat", scene);
      mat.diffuseColor = flock.BABYLON.Color3.White();
      mat.backFaceCulling = false;
      mat.vertexColors = true;
      mesh.material = mat;
      return;
    }
    if (shapeType === "Cylinder") {
      const positions = mesh.getVerticesData(
        flock.BABYLON.VertexBuffer.PositionKind,
      );
      const indices = mesh.getIndices();
      const normals = mesh.getVerticesData(
        flock.BABYLON.VertexBuffer.NormalKind,
      );

      if (!positions || !indices) {
        console.warn(
          "Missing geometry for cylinder; falling back to uniform color.",
        );
        return this.applyMaterialToMesh(
          mesh,
          shapeType,
          color[0],
          alpha,
        );
      }

      const colors = [];
      const newPositions = [];
      const newNormals = [];
      const newIndices = [];

      const yVals = [];
      for (let i = 0; i < positions.length; i += 3) {
        yVals.push(positions[i + 1]);
      }

      const minY = Math.min(...yVals);
      const maxY = Math.max(...yVals);

      const makeColorFromIndex = (i) =>
        makeColor4(color[i % color.length]);

      let baseIndex = 0;
      let sideFaceIndex = 0;

      for (let i = 0; i < indices.length; i += 3) {
        const vi0 = indices[i];
        const vi1 = indices[i + 1];
        const vi2 = indices[i + 2];

        const y0 = positions[vi0 * 3 + 1];
        const y1 = positions[vi1 * 3 + 1];
        const y2 = positions[vi2 * 3 + 1];

        const isTop = y0 === maxY && y1 === maxY && y2 === maxY;
        const isBottom = y0 === minY && y1 === minY && y2 === minY;

        let faceColor;

        if (isTop) {
          faceColor = makeColor4(color[0]); // always color[0]
        } else if (isBottom) {
          faceColor = makeColor4(
            color.length > 1 ? color[1] : color[0],
          ); // fallback to top if only 1 color
        } else {
          if (color.length === 2) {
            faceColor = makeColor4(color[1]);
          } else if (color.length === 3) {
            faceColor = makeColor4(color[2]);
          } else {
            // Use color[2+] for alternating side face colors, one color per 2 triangles
            const sideColorIndex =
              2 + Math.floor(sideFaceIndex / 2);
            faceColor = makeColor4(
              color[(sideColorIndex % (color.length - 2)) + 2],
            );
            sideFaceIndex++;
          }
        }

        for (let j = 0; j < 3; j++) {
          const vi = indices[i + j];

          newPositions.push(
            positions[vi * 3],
            positions[vi * 3 + 1],
            positions[vi * 3 + 2],
          );

          if (normals) {
            newNormals.push(
              normals[vi * 3],
              normals[vi * 3 + 1],
              normals[vi * 3 + 2],
            );
          }

          colors.push(
            faceColor.r,
            faceColor.g,
            faceColor.b,
            faceColor.a,
          );
          newIndices.push(baseIndex++);
        }
      }

      mesh.setVerticesData(
        flock.BABYLON.VertexBuffer.PositionKind,
        newPositions,
      );
      if (normals)
        mesh.setVerticesData(
          flock.BABYLON.VertexBuffer.NormalKind,
          newNormals,
        );
      mesh.setVerticesData(flock.BABYLON.VertexBuffer.ColorKind, colors);
      mesh.setIndices(newIndices);

      mesh.hasVertexAlpha = true;

      const mat = new flock.BABYLON.StandardMaterial("cylColorMat", scene);
      mat.diffuseColor = flock.BABYLON.Color3.White();
      mat.backFaceCulling = false;
      mat.vertexColors = true;
      mesh.material = mat;
      return;
    }

    const material = new flock.BABYLON.StandardMaterial(
      `${shapeType.toLowerCase()}Material`,
      mesh.getScene(),
    );
    material.diffuseColor = flock.BABYLON.Color3.FromHexString(
      flock.getColorFromString(color[0]),
    );
    material.alpha = alpha;
    mesh.material = material;
  },
  getOrCreateMaterial(color, alpha, scene) {
    const color3 =
      typeof color === "string"
        ? flock.BABYLON.Color3.FromHexString(color)
        : color;
    const materialKey = `Color_${color3.toHexString()}_Alpha_${alpha}`;

    if (!flock.materialCache[materialKey]) {
      const material = new flock.BABYLON.StandardMaterial(materialKey, scene);
      material.diffuseColor = color3;
      material.alpha = alpha;
      material.backFaceCulling = false;
      flock.materialCache[materialKey] = material;
    }

    return flock.materialCache[materialKey];
  },

}