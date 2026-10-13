from .store import seed, DATA
if __name__=='__main__':
    created=seed()
    print('Dados fictícios criados.' if created else 'Banco já inicializado; registros preservados.')
    print(f'Acessos de demonstração: {DATA / "ACESSOS-LOCAIS.md"}')
