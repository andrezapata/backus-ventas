import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.removeItem('backus-ventas-registros');
  });

  it('renders the Backus Ventas workspace with catalog data', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTesting.expectOne('/data/catalogo.json').flush([
      { id: 1, nombre: 'Cristal 620 ml', categoria: 'Cerveza', precio: 3.4, stock: 120 },
    ]);
    httpTesting.expectOne('/data/precios.json').flush([]);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Buen día, Andre');
    expect(compiled.querySelector('.product-card h3')?.textContent).toContain('Cristal 620 ml');
  });

  it('adds products to the cart and updates the total', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.productos = [{ id: 1, nombre: 'Cristal 620 ml', categoria: 'Cerveza', precio: 3.4, stock: 120 }];

    app.agregar(app.productos[0]);
    app.agregar(app.productos[0]);

    expect(app.cantidadTotal).toBe(2);
    expect(app.importeTotal).toBe(6.8);
  });

  it('keeps the cart when an order is submitted offline', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const product = { id: 1, nombre: 'Cristal 620 ml', categoria: 'Cerveza', precio: 3.4, stock: 120 };
    app.carrito = [{ producto: product, cantidad: 2 }];
    app.conectado = false;

    app.registrarPedido();

    expect(app.carrito.length).toBe(1);
    expect(app.pedidoRechazado).toBeTrue();
    expect(app.mensajePedido).toContain('el pedido no se guardó');
  });

  it('saves a confirmed order and opens the records modal', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const product = { id: 1, nombre: 'Cristal 620 ml', categoria: 'Cerveza', precio: 3.4, stock: 120 };
    app.carrito = [{ producto: product, cantidad: 2 }];
    app.nombreCliente = 'María Pérez';
    app.nombreNegocio = 'Bodega San Martín';
    app.conectado = true;

    app.registrarPedido();

    expect(app.registrosPedidos.length).toBe(1);
    expect(app.registrosPedidos[0].cliente).toBe('Bodega San Martín');
    expect(app.registrosPedidos[0].total).toBe(6.8);
    expect(app.modalRegistrosAbierto).toBeTrue();
    expect(JSON.parse(localStorage.getItem('backus-ventas-registros') ?? '[]').length).toBe(1);
  });
});
